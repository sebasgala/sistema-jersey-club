import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ErrorNegocio } from '../common/errores.filter';
import type { Pagina } from '../common/http.util';
import { Producto } from '../productos/entities/producto.entity';
import { Variante } from '../variantes/entities/variante.entity';
import {
  aMovimientoApi,
  aSnapshot,
  type MovimientoApi,
  type SnapshotVariante,
} from '../variantes/variante.mapper';
import type {
  BuscarMovimientosDto,
  SolicitudAjusteDto,
  SolicitudDescuentoDto,
  SolicitudReversionDto,
} from './dto/stock.dto';
import { MovimientoStock } from './entities/movimiento-stock.entity';

export interface ResultadoDescuento {
  referencia_id: string;
  items: { movimiento: MovimientoApi; snapshot: SnapshotVariante }[];
}

export interface ResultadoMovimientos {
  referencia_id: string;
  movimientos: MovimientoApi[];
}

/** Resultado + indicador de si fue una repetición idempotente (200) o nuevo (201). */
export interface ConReplay<T> {
  replay: boolean;
  resultado: T;
}

function esUnicidad(e: unknown): boolean {
  return (
    e instanceof QueryFailedError &&
    (e.driverError as { code?: string }).code === '23505'
  );
}

/**
 * Operaciones que mueven stock (Directriz 2). Todas:
 * - corren en una transacción ACID con SELECT ... FOR UPDATE sobre las variantes,
 *   bloqueadas siempre en orden de id para evitar interbloqueos;
 * - registran un movimiento por variante en el Kardex;
 * - son idempotentes por Idempotency-Key (también ante reintentos concurrentes).
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MovimientoStock)
    private readonly movimientos: Repository<MovimientoStock>,
  ) {}

  // ---------------------------------------------------------------- descuentos
  async descontar(
    clave: string,
    dto: SolicitudDescuentoDto,
  ): Promise<ConReplay<ResultadoDescuento>> {
    // Una variante repetida en la solicitud se descuenta una sola vez por la suma.
    const pedido = new Map<string, number>();
    for (const item of dto.items) {
      pedido.set(
        item.variante_id,
        (pedido.get(item.variante_id) ?? 0) + item.cantidad,
      );
    }
    const claves = [...pedido.keys()].map((id) => `${clave}:${id}`);

    const previo = await this.descuentoPrevio(clave, claves, dto, pedido);
    if (previo) return previo;

    const yaDescontada = await this.movimientos.exists({
      where: { referenciaId: dto.referencia_id, tipo: 'VENTA' },
    });
    if (yaDescontada) {
      throw new ErrorNegocio(409, 'REFERENCIA_YA_DESCONTADA', [
        `La referencia ${dto.referencia_id} ya tiene un descuento con otra Idempotency-Key`,
      ]);
    }

    try {
      const resultado = await this.dataSource.transaction(async (m) => {
        const variantes = await this.bloquear(m, [...pedido.keys()]);

        const faltantes = [...pedido.keys()].filter(
          (id) => !variantes.some((v) => v.id === id),
        );
        if (faltantes.length) {
          throw new ErrorNegocio(
            404,
            'VARIANTE_NO_ENCONTRADA',
            faltantes.map((id) => `No existe la variante ${id}`),
          );
        }
        const inactivas = variantes.filter((v) => !v.activo);
        if (inactivas.length) {
          throw new ErrorNegocio(
            409,
            'VARIANTE_INACTIVA',
            inactivas.map(
              (v) =>
                `La variante ${v.id} (${v.codigoLegacy ?? 'sin código'}) está inactiva`,
            ),
          );
        }
        const sinStock = variantes.filter(
          (v) => v.stockActual < (pedido.get(v.id) ?? 0),
        );
        if (sinStock.length) {
          // El throw hace ROLLBACK: no se descuenta ninguna variante.
          throw new ErrorNegocio(
            409,
            'STOCK_INSUFICIENTE',
            sinStock.map(
              (v) =>
                `Variante ${v.id} (${v.codigoLegacy ?? 'sin código'}): solicitado ${pedido.get(v.id)}, disponible ${v.stockActual}`,
            ),
          );
        }

        const productos = await m.find(Producto, {
          where: { id: In([...new Set(variantes.map((v) => v.productoId))]) },
        });
        const items: ResultadoDescuento['items'] = [];
        for (const v of variantes) {
          const cantidad = pedido.get(v.id) ?? 0;
          const movimiento = await this.registrar(m, v, 'VENTA', cantidad, {
            idempotencyKey: `${clave}:${v.id}`,
            referenciaId: dto.referencia_id,
            costoUnitario: v.valorJerseyClub,
            observacion: 'Descuento por venta',
          });
          const producto = productos.find((p) => p.id === v.productoId);
          if (!producto)
            throw new Error(`Producto ${v.productoId} no encontrado`);
          items.push({
            movimiento: aMovimientoApi(movimiento),
            snapshot: aSnapshot(v, producto),
          });
        }
        return {
          referencia_id: dto.referencia_id,
          items: this.ordenar(items, dto),
        };
      });
      return { replay: false, resultado };
    } catch (e) {
      // Otra petición con la misma clave ganó la carrera: devolver su resultado.
      if (esUnicidad(e)) {
        const repetido = await this.descuentoPrevio(clave, claves, dto, pedido);
        if (repetido) return repetido;
      }
      throw e;
    }
  }

  private async descuentoPrevio(
    clave: string,
    claves: string[],
    dto: SolicitudDescuentoDto,
    pedido: Map<string, number>,
  ): Promise<ConReplay<ResultadoDescuento> | null> {
    const previos = await this.movimientos.find({
      where: { idempotencyKey: In(claves) },
    });
    const otrosConClave = await this.movimientos
      .createQueryBuilder('mv')
      .where('mv.idempotency_key LIKE :pref', {
        pref: `${clave.replace(/[\\%_]/g, '\\$&')}:%`,
      })
      .andWhere('mv.idempotency_key NOT IN (:...claves)', { claves })
      .getCount();
    if (!previos.length && !otrosConClave) return null;

    const coincide =
      otrosConClave === 0 &&
      previos.length === pedido.size &&
      previos.every(
        (mv) =>
          mv.tipo === 'VENTA' &&
          mv.referenciaId === dto.referencia_id &&
          pedido.get(mv.varianteId) === mv.cantidad,
      );
    if (!coincide) {
      throw new ErrorNegocio(409, 'IDEMPOTENCY_KEY_CONFLICTO', [
        `La Idempotency-Key ${clave} ya se usó con un contenido distinto`,
      ]);
    }
    const variantes = await this.dataSource.getRepository(Variante).find({
      where: { id: In(previos.map((mv) => mv.varianteId)) },
      relations: { producto: true },
    });
    const items = previos.map((mv) => {
      const v = variantes.find((x) => x.id === mv.varianteId);
      if (!v?.producto)
        throw new Error(`Variante ${mv.varianteId} no encontrada`);
      // El costo devuelto es el congelado en el movimiento original.
      return {
        movimiento: aMovimientoApi(mv),
        snapshot: aSnapshot(v, v.producto, mv.costoUnitario),
      };
    });
    return {
      replay: true,
      resultado: {
        referencia_id: dto.referencia_id,
        items: this.ordenar(items, dto),
      },
    };
  }

  private ordenar(
    items: ResultadoDescuento['items'],
    dto: SolicitudDescuentoDto,
  ): ResultadoDescuento['items'] {
    const orden = [...new Set(dto.items.map((i) => i.variante_id))];
    return [...items].sort(
      (a, b) =>
        orden.indexOf(a.snapshot.variante_id) -
        orden.indexOf(b.snapshot.variante_id),
    );
  }

  // ---------------------------------------------------------------- reversiones
  async revertir(
    clave: string,
    dto: SolicitudReversionDto,
  ): Promise<ConReplay<ResultadoMovimientos>> {
    const ventas = await this.movimientos.find({
      where: { referenciaId: dto.referencia_id, tipo: 'VENTA' },
    });
    if (!ventas.length) {
      throw new ErrorNegocio(404, 'DESCUENTO_NO_ENCONTRADO', [
        `No existe un descuento para la referencia ${dto.referencia_id}`,
      ]);
    }
    const previa = await this.reversionPrevia(
      this.movimientos.manager,
      dto.referencia_id,
    );
    if (previa) return previa;

    try {
      const resultado = await this.dataSource.transaction(async (m) => {
        const variantes = await this.bloquear(
          m,
          ventas.map((mv) => mv.varianteId),
        );
        // Re-verificar tras obtener los bloqueos: otra reversión pudo terminar antes.
        const ganada = await this.reversionPrevia(m, dto.referencia_id);
        if (ganada) return ganada.resultado;

        const movimientos: MovimientoApi[] = [];
        for (const venta of ventas) {
          const v = variantes.find((x) => x.id === venta.varianteId);
          if (!v) throw new Error(`Variante ${venta.varianteId} no encontrada`);
          const mv = await this.registrar(
            m,
            v,
            'REVERSION_VENTA',
            venta.cantidad,
            {
              idempotencyKey: `R:${clave}:${v.id}`,
              referenciaId: dto.referencia_id,
              costoUnitario: venta.costoUnitario,
              observacion: dto.motivo
                ? `Reversión de venta: ${dto.motivo}`
                : 'Reversión de venta',
            },
          );
          movimientos.push(aMovimientoApi(mv));
        }
        return { referencia_id: dto.referencia_id, movimientos };
      });
      return { replay: false, resultado };
    } catch (e) {
      if (esUnicidad(e)) {
        const previaTrasCarrera = await this.reversionPrevia(
          this.movimientos.manager,
          dto.referencia_id,
        );
        if (previaTrasCarrera) return previaTrasCarrera;
      }
      throw e;
    }
  }

  private async reversionPrevia(
    m: EntityManager,
    referenciaId: string,
  ): Promise<ConReplay<ResultadoMovimientos> | null> {
    const reversiones = await m.find(MovimientoStock, {
      where: { referenciaId, tipo: 'REVERSION_VENTA' },
      order: { createdAt: 'ASC' },
    });
    if (!reversiones.length) return null;
    return {
      replay: true,
      resultado: {
        referencia_id: referenciaId,
        movimientos: reversiones.map(aMovimientoApi),
      },
    };
  }

  // ---------------------------------------------------------------- ajustes
  async ajustar(
    clave: string,
    dto: SolicitudAjusteDto,
  ): Promise<ConReplay<MovimientoApi>> {
    const previo = await this.ajustePrevio(clave, dto);
    if (previo) return previo;
    try {
      const movimiento = await this.dataSource.transaction(async (m) => {
        const [v] = await this.bloquear(m, [dto.variante_id]);
        if (!v) {
          throw new ErrorNegocio(404, 'VARIANTE_NO_ENCONTRADA', [
            `No existe la variante ${dto.variante_id}`,
          ]);
        }
        if (dto.tipo === 'AJUSTE_SALIDA' && v.stockActual < dto.cantidad) {
          throw new ErrorNegocio(409, 'STOCK_INSUFICIENTE', [
            `Variante ${v.id} (${v.codigoLegacy ?? 'sin código'}): salida ${dto.cantidad}, disponible ${v.stockActual}`,
          ]);
        }
        return this.registrar(m, v, dto.tipo, dto.cantidad, {
          idempotencyKey: clave,
          referenciaId: null,
          costoUnitario: v.valorJerseyClub,
          observacion: dto.observacion,
        });
      });
      return { replay: false, resultado: aMovimientoApi(movimiento) };
    } catch (e) {
      if (esUnicidad(e)) {
        const repetido = await this.ajustePrevio(clave, dto);
        if (repetido) return repetido;
      }
      throw e;
    }
  }

  private async ajustePrevio(
    clave: string,
    dto: SolicitudAjusteDto,
  ): Promise<ConReplay<MovimientoApi> | null> {
    const previo = await this.movimientos.findOne({
      where: { idempotencyKey: clave },
    });
    if (!previo) return null;
    if (
      previo.varianteId !== dto.variante_id ||
      previo.tipo !== dto.tipo ||
      previo.cantidad !== dto.cantidad
    ) {
      throw new ErrorNegocio(409, 'IDEMPOTENCY_KEY_CONFLICTO', [
        `La Idempotency-Key ${clave} ya se usó con un contenido distinto`,
      ]);
    }
    return { replay: true, resultado: aMovimientoApi(previo) };
  }

  // ---------------------------------------------------------------- Kardex
  async listarMovimientos(
    f: BuscarMovimientosDto,
  ): Promise<Pagina<MovimientoApi>> {
    const qb = this.movimientos.createQueryBuilder('mv');
    if (f.variante_id)
      qb.andWhere('mv.variante_id = :vid', { vid: f.variante_id });
    if (f.referencia_id)
      qb.andWhere('mv.referencia_id = :rid', { rid: f.referencia_id });
    if (f.tipo) qb.andWhere('mv.tipo = :tipo', { tipo: f.tipo });
    if (f.desde) qb.andWhere('mv.created_at >= :desde', { desde: f.desde });
    if (f.hasta) qb.andWhere('mv.created_at <= :hasta', { hasta: f.hasta });
    qb.orderBy('mv.created_at', 'DESC')
      .offset((f.page - 1) * f.limit)
      .limit(f.limit);
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map(aMovimientoApi),
      meta: { page: f.page, limit: f.limit, total },
    };
  }

  // ---------------------------------------------------------------- utilidades
  /** SELECT ... FOR UPDATE en orden de id (evita interbloqueos entre ventas simultáneas). */
  private bloquear(m: EntityManager, ids: string[]): Promise<Variante[]> {
    return m
      .createQueryBuilder(Variante, 'v')
      .setLock('pessimistic_write')
      .where('v.id IN (:...ids)', { ids: [...new Set(ids)] })
      .orderBy('v.id', 'ASC')
      .getMany();
  }

  /** Actualiza el stock y registra el movimiento en la misma transacción. */
  private async registrar(
    m: EntityManager,
    v: Variante,
    tipo: MovimientoStock['tipo'],
    cantidad: number,
    datos: {
      idempotencyKey: string;
      referenciaId: string | null;
      costoUnitario: string | null;
      observacion: string;
    },
  ): Promise<MovimientoStock> {
    const entrada =
      tipo === 'REVERSION_VENTA' ||
      tipo === 'AJUSTE_ENTRADA' ||
      tipo === 'SALDO_INICIAL';
    const anterior = v.stockActual;
    const nuevo = entrada ? anterior + cantidad : anterior - cantidad;
    await m.update(Variante, { id: v.id }, { stockActual: nuevo });
    v.stockActual = nuevo;
    const movimiento = await m.save(
      m.create(MovimientoStock, {
        varianteId: v.id,
        tipo,
        cantidad,
        stockAnterior: anterior,
        stockNuevo: nuevo,
        ...datos,
      }),
    );
    this.logger.log(
      `${tipo} variante=${v.id} cantidad=${cantidad} stock ${anterior}->${nuevo} clave=${datos.idempotencyKey}`,
    );
    return movimiento;
  }
}
