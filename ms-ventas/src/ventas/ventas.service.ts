import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { aCentavos, deCentavos } from '../common/dinero.util';
import { ErrorNegocio } from '../common/errores.filter';
import type { Pagina, UsuarioContexto } from '../common/http.util';
import {
  type ClienteRemoto,
  IntegracionesService,
  type SnapshotVariante,
} from '../integraciones/integraciones.service';
import { OutboxEvento } from '../outbox/entities/outbox-evento.entity';
import type {
  BuscarVentasDto,
  CrearVentaDto,
  DashboardDto,
} from './dto/venta.dto';
import { DetalleVenta } from './entities/detalle-venta.entity';
import { Venta } from './entities/venta.entity';

export const CONSUMIDOR_FINAL_ID = '00000000-0000-4000-8000-000000000001';
const ZONA = 'America/Guayaquil';

/** Snapshot local del consumidor final: permite vender aunque ms-clientes esté caído. */
const SNAPSHOT_CONSUMIDOR_FINAL = {
  id: CONSUMIDOR_FINAL_ID,
  tipo_identificacion: 'CONSUMIDOR_FINAL',
  identificacion: '9999999999999',
  nombre_completo: 'CONSUMIDOR FINAL',
};

export interface DetalleVentaApi {
  id: string;
  variante_id: string;
  snapshot_producto: Record<string, unknown>;
  cantidad: number;
  precio_venta_unitario: string;
  valor_jersey_club_unitario: string;
  subtotal: string;
  ganancia_linea: string;
}

export interface VentaApi {
  id: string;
  numero_comprobante: string;
  cliente_id: string;
  cliente_snapshot: Record<string, unknown>;
  vendedor_id: string | null;
  metodo_pago: string;
  estado: string;
  total_vendido: string;
  costo_total_jrs: string;
  ganancia_total: string;
  observacion: string | null;
  created_at: Date;
  updated_at: Date;
  anulada_at: Date | null;
  anulada_por: string | null;
  motivo_anulacion: string | null;
  detalle?: DetalleVentaApi[];
}

export function aVentaApi(v: Venta, conDetalle: boolean): VentaApi {
  return {
    id: v.id,
    numero_comprobante: v.numeroComprobante,
    cliente_id: v.clienteId,
    cliente_snapshot: v.clienteSnapshot,
    vendedor_id: v.vendedorId,
    metodo_pago: v.metodoPago,
    estado: v.estado,
    total_vendido: v.totalVendido,
    costo_total_jrs: v.costoTotalJrs,
    ganancia_total: v.gananciaTotal,
    observacion: v.observacion,
    created_at: v.createdAt,
    updated_at: v.updatedAt,
    anulada_at: v.anuladaAt,
    anulada_por: v.anuladaPor,
    motivo_anulacion: v.motivoAnulacion,
    ...(conDetalle
      ? {
          detalle: (v.detalle ?? []).map((d) => ({
            id: d.id,
            variante_id: d.varianteId,
            snapshot_producto: d.snapshotProducto,
            cantidad: d.cantidad,
            precio_venta_unitario: d.precioVentaUnitario,
            valor_jersey_club_unitario: d.valorJerseyClubUnitario,
            subtotal: d.subtotal,
            ganancia_linea: d.gananciaLinea,
          })),
        }
      : {}),
  };
}

export interface ResultadoVenta {
  replay: boolean;
  venta: VentaApi;
  advertencias: string[];
}

/**
 * Orquestador del flujo comercial cerrado (Directriz 4), saga orquestada:
 *   PENDIENTE → descuento en ms-inventario → transacción local → CONFIRMADA
 *   409 de inventario → RECHAZADA · fallo tras descontar → reversión → FALLIDA
 */
@Injectable()
export class VentasService {
  private readonly logger = new Logger(VentasService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Venta) private readonly ventas: Repository<Venta>,
    private readonly integraciones: IntegracionesService,
  ) {}

  async crear(
    clave: string,
    dto: CrearVentaDto,
    correlationId: string,
    usuario: UsuarioContexto,
  ): Promise<ResultadoVenta> {
    // 1. Idempotencia
    const previa = await this.ventas.findOne({
      where: { idempotencyKey: clave },
    });
    if (previa) return this.resultadoPrevio(previa);

    // 2. Cliente (con degradación si ms-clientes no responde)
    const advertencias: string[] = [];
    const { clienteId, snapshot } = await this.resolverCliente(
      dto,
      correlationId,
      advertencias,
    );

    // 3. Cabecera PENDIENTE
    let venta: Venta;
    try {
      venta = await this.ventas.save(
        this.ventas.create({
          numeroComprobante: await this.siguienteComprobante(),
          idempotencyKey: clave,
          clienteId,
          clienteSnapshot: snapshot,
          // Directriz 4: el vendedor es el usuario autenticado (X-User-Id que propaga el gateway).
          // El vendedor_id del cuerpo solo se usa en llamadas internas sin gateway.
          vendedorId: usuario.id ?? dto.vendedor_id ?? null,
          metodoPago: dto.metodo_pago,
          estado: 'PENDIENTE',
          totalVendido: '0.00',
          costoTotalJrs: '0.00',
          gananciaTotal: '0.00',
          observacion: dto.observacion ?? null,
        }),
      );
    } catch (e) {
      if (this.esUnicidad(e)) {
        const ganadora = await this.ventas.findOne({
          where: { idempotencyKey: clave },
        });
        if (ganadora) return this.resultadoPrevio(ganadora);
      }
      throw e;
    }

    // 4. Descuento atómico en ms-inventario (Idempotency-Key = id de la venta)
    const descuento = await this.integraciones.descontarStock(
      venta.id,
      dto.items.map((i) => ({
        variante_id: i.variante_id,
        cantidad: i.cantidad,
      })),
      correlationId,
    );
    if (descuento.tipo === 'error_http') {
      await this.marcar(
        venta.id,
        'RECHAZADA',
        `${descuento.error_code}: ${descuento.details.join('; ')}`,
      );
      throw new ErrorNegocio(
        descuento.status,
        descuento.error_code,
        descuento.details,
      );
    }
    if (descuento.tipo === 'no_disponible') {
      // Resultado incierto (p. ej. timeout tras descontar): compensar por si acaso.
      await this.compensar(
        venta.id,
        `Inventario no disponible: ${descuento.motivo}`,
        correlationId,
      );
      throw new ErrorNegocio(503, 'INVENTARIO_NO_DISPONIBLE', [
        'No se pudo verificar el stock; la venta no se registró',
        descuento.motivo,
      ]);
    }

    // 5. Confirmación local: detalle con costo congelado + outbox + CONFIRMADA
    const snapshots = new Map<string, SnapshotVariante>(
      descuento.data.items.map((i) => [i.snapshot.variante_id, i.snapshot]),
    );
    try {
      await this.confirmar(venta, dto, snapshots);
    } catch (e) {
      // 6. Compensación
      const motivo = e instanceof Error ? e.message : String(e);
      this.logger.error(`Fallo al confirmar la venta ${venta.id}: ${motivo}`);
      const revertido = await this.compensar(
        venta.id,
        `Error al confirmar: ${motivo}`,
        correlationId,
      );
      throw new ErrorNegocio(500, 'VENTA_FALLIDA', [
        'La venta no pudo confirmarse',
        revertido
          ? 'El stock descontado fue revertido'
          : 'La reversión de stock quedó pendiente; la venta sigue en PENDIENTE para conciliación',
      ]);
    }

    return { replay: false, venta: await this.obtener(venta.id), advertencias };
  }

  private async confirmar(
    venta: Venta,
    dto: CrearVentaDto,
    snapshots: Map<string, SnapshotVariante>,
  ): Promise<void> {
    let total = 0;
    let costo = 0;
    const lineas = dto.items.map((item) => {
      const snapshot = snapshots.get(item.variante_id);
      if (!snapshot)
        throw new Error(`Sin snapshot para la variante ${item.variante_id}`);
      const precio = aCentavos(item.precio_venta_unitario);
      const costoUnitario = aCentavos(snapshot.valor_jersey_club);
      const subtotal = item.cantidad * precio;
      const costoLinea = item.cantidad * costoUnitario;
      total += subtotal;
      costo += costoLinea;
      return {
        ventaId: venta.id,
        varianteId: item.variante_id,
        snapshotProducto: snapshot as unknown as Record<string, unknown>,
        cantidad: item.cantidad,
        precioVentaUnitario: deCentavos(precio),
        valorJerseyClubUnitario: deCentavos(costoUnitario),
        subtotal: deCentavos(subtotal),
        gananciaLinea: deCentavos(subtotal - costoLinea),
      };
    });
    const totales = {
      totalVendido: deCentavos(total),
      costoTotalJrs: deCentavos(costo),
      gananciaTotal: deCentavos(total - costo),
    };

    await this.dataSource.transaction(async (m) => {
      await m.save(m.create(DetalleVenta, lineas));
      await m.update(
        Venta,
        { id: venta.id },
        { ...totales, estado: 'CONFIRMADA' },
      );
      await m.save(
        m.create(OutboxEvento, {
          agregadoTipo: 'VENTA',
          agregadoId: venta.id,
          tipoEvento: 'VentaConfirmada',
          payload: {
            version: 1,
            venta_id: venta.id,
            numero_comprobante: venta.numeroComprobante,
            cliente_id: venta.clienteId,
            vendedor_id: venta.vendedorId,
            metodo_pago: venta.metodoPago,
            total_vendido: totales.totalVendido,
            costo_total_jrs: totales.costoTotalJrs,
            ganancia_total: totales.gananciaTotal,
            items: lineas.map((l) => ({
              variante_id: l.varianteId,
              cantidad: l.cantidad,
              precio_venta_unitario: l.precioVentaUnitario,
              valor_jersey_club_unitario: l.valorJerseyClubUnitario,
              ganancia_linea: l.gananciaLinea,
            })),
            confirmada_en: new Date().toISOString(),
          },
        }),
      );
    });
  }

  /** Revierte el stock (idempotente) y marca FALLIDA. Si no puede revertir, deja PENDIENTE. */
  private async compensar(
    ventaId: string,
    motivo: string,
    correlationId: string,
  ): Promise<boolean> {
    const r = await this.integraciones.revertirStock(
      ventaId,
      motivo,
      correlationId,
    );
    const revertido =
      r.tipo === 'ok' ||
      (r.tipo === 'error_http' && r.error_code === 'DESCUENTO_NO_ENCONTRADO');
    if (revertido) {
      await this.marcar(ventaId, 'FALLIDA', motivo);
    } else {
      this.logger.error(
        `Reversión pendiente para la venta ${ventaId}: ${JSON.stringify(r)}`,
      );
      await this.ventas.update(
        { id: ventaId },
        { observacion: `REVERSION_PENDIENTE: ${motivo}`.slice(0, 1000) },
      );
    }
    return revertido;
  }

  private async marcar(
    id: string,
    estado: 'RECHAZADA' | 'FALLIDA',
    motivo: string,
  ): Promise<void> {
    await this.ventas.update(
      { id },
      { estado, observacion: `${estado}: ${motivo}`.slice(0, 1000) },
    );
  }

  private resultadoPrevio(previa: Venta): Promise<ResultadoVenta> | never {
    switch (previa.estado) {
      case 'CONFIRMADA':
        return this.obtener(previa.id).then((venta) => ({
          replay: true,
          venta,
          advertencias: [],
        }));
      case 'PENDIENTE':
        throw new ErrorNegocio(409, 'VENTA_EN_PROCESO', [
          `La venta ${previa.numeroComprobante} con esta Idempotency-Key aún está en proceso`,
        ]);
      default:
        throw new ErrorNegocio(
          409,
          `VENTA_${previa.estado}`,
          [
            `La venta ${previa.numeroComprobante} con esta Idempotency-Key terminó ${previa.estado}`,
            previa.observacion ?? '',
            'Para reintentar use una nueva Idempotency-Key',
          ].filter(Boolean),
        );
    }
  }

  private async resolverCliente(
    dto: CrearVentaDto,
    correlationId: string,
    advertencias: string[],
  ): Promise<{ clienteId: string; snapshot: Record<string, unknown> }> {
    const respaldo = dto.cliente_respaldo
      ? { ...dto.cliente_respaldo, origen: 'RESPALDO_PAYLOAD' }
      : null;

    if (!dto.cliente_id || dto.cliente_id === CONSUMIDOR_FINAL_ID) {
      // Sin cliente registrado: consumidor final (o los datos del payload, si vienen).
      return {
        clienteId: CONSUMIDOR_FINAL_ID,
        snapshot: respaldo ?? {
          ...SNAPSHOT_CONSUMIDOR_FINAL,
          origen: 'CONSUMIDOR_FINAL',
        },
      };
    }

    const r = await this.integraciones.obtenerCliente(
      dto.cliente_id,
      correlationId,
    );
    if (r.tipo === 'ok') {
      return { clienteId: r.data.id, snapshot: this.snapshotCliente(r.data) };
    }
    if (r.tipo === 'error_http') {
      // Un 404/400 es un error real del usuario: no se degrada.
      throw new ErrorNegocio(r.status, r.error_code, r.details);
    }
    // ms-clientes no disponible: degradación elegante sin bloquear la venta (Directriz 1).
    advertencias.push(
      `ms-clientes no respondió (${r.motivo}); se usó ${respaldo ? 'el cliente de respaldo del payload' : 'un snapshot pendiente de conciliar'}`,
    );
    return {
      clienteId: dto.cliente_id,
      snapshot: respaldo
        ? { id: dto.cliente_id, ...respaldo }
        : {
            id: dto.cliente_id,
            origen: 'NO_VERIFICADO',
            nota: 'ms-clientes no disponible al vender',
          },
    };
  }

  private snapshotCliente(c: ClienteRemoto): Record<string, unknown> {
    return {
      id: c.id,
      tipo_identificacion: c.tipo_identificacion,
      identificacion: c.identificacion,
      nombre_completo: c.nombre_completo,
      telefono: c.telefono,
      email: c.email,
      provincia: c.provincia,
      ciudad: c.ciudad,
      direccion_referencia: c.direccion_referencia,
      courier_preferido: c.courier_preferido,
      origen: 'MS_CLIENTES',
    };
  }

  private async siguienteComprobante(): Promise<string> {
    const [fila] = await this.dataSource.query<{ n: string; anio: string }[]>(
      `SELECT nextval('seq_numero_comprobante') AS n, to_char(now() AT TIME ZONE $1, 'YYYY') AS anio`,
      [ZONA],
    );
    return `JC-${fila.anio}-${fila.n.padStart(6, '0')}`;
  }

  private esUnicidad(e: unknown): boolean {
    return (
      e instanceof QueryFailedError &&
      (e.driverError as { code?: string }).code === '23505'
    );
  }

  /**
   * Anula una venta CONFIRMADA: devuelve el stock exacto al Kardex (REVERSION_VENTA, idempotente
   * por venta en ms-inventario), marca ANULADA y registra VentaAnulada en el outbox.
   * Repetirla sobre una venta ya anulada devuelve la misma venta (replay) sin tocar el stock.
   */
  async anular(
    id: string,
    motivo: string,
    usuario: UsuarioContexto,
    correlationId: string,
  ): Promise<{ replay: boolean; venta: VentaApi }> {
    const venta = await this.ventas.findOne({
      where: { id },
      relations: { detalle: true },
    });
    if (!venta) {
      throw new ErrorNegocio(404, 'VENTA_NO_ENCONTRADA', [
        `No existe la venta ${id}`,
      ]);
    }
    if (venta.estado === 'ANULADA') {
      return { replay: true, venta: await this.obtener(id) };
    }
    if (venta.estado !== 'CONFIRMADA') {
      throw new ErrorNegocio(409, 'VENTA_NO_ANULABLE', [
        `Solo se pueden anular ventas confirmadas; la venta ${venta.numeroComprobante} está ${venta.estado}`,
      ]);
    }

    // 1. Devolver el stock. Si falla, la venta sigue CONFIRMADA y se puede reintentar sin riesgo.
    const r = await this.integraciones.revertirStock(
      venta.id,
      `Anulación: ${motivo}`,
      correlationId,
    );
    if (r.tipo === 'no_disponible') {
      throw new ErrorNegocio(503, 'INVENTARIO_NO_DISPONIBLE', [
        'No se pudo devolver el stock; la venta sigue confirmada. Intenta de nuevo.',
        r.motivo,
      ]);
    }
    if (r.tipo === 'error_http') {
      throw new ErrorNegocio(r.status, r.error_code, r.details);
    }

    // 2. Marcar ANULADA y dejar el evento, en una sola transacción local.
    const anulada = await this.dataSource.transaction(async (m) => {
      const res = await m.update(
        Venta,
        { id: venta.id, estado: 'CONFIRMADA' },
        {
          estado: 'ANULADA',
          anuladaAt: new Date(),
          anuladaPor: usuario.id,
          motivoAnulacion: motivo,
        },
      );
      if (!res.affected) return false; // otra anulación simultánea ganó la carrera
      await m.save(
        m.create(OutboxEvento, {
          agregadoTipo: 'VENTA',
          agregadoId: venta.id,
          tipoEvento: 'VentaAnulada',
          payload: {
            version: 1,
            venta_id: venta.id,
            numero_comprobante: venta.numeroComprobante,
            cliente_id: venta.clienteId,
            vendedor_id: venta.vendedorId,
            anulada_por: usuario.id,
            motivo,
            total_vendido: venta.totalVendido,
            costo_total_jrs: venta.costoTotalJrs,
            ganancia_total: venta.gananciaTotal,
            items: (venta.detalle ?? []).map((d) => ({
              variante_id: d.varianteId,
              cantidad: d.cantidad,
            })),
            anulada_en: new Date().toISOString(),
          },
        }),
      );
      return true;
    });

    if (!anulada) {
      const actual = await this.obtener(id);
      if (actual.estado === 'ANULADA') return { replay: true, venta: actual };
      throw new ErrorNegocio(409, 'VENTA_NO_ANULABLE', [
        `La venta cambió de estado mientras se anulaba (${actual.estado})`,
      ]);
    }
    return { replay: false, venta: await this.obtener(id) };
  }

  // ---------------------------------------------------------------- consultas
  async obtener(id: string): Promise<VentaApi> {
    const venta = await this.ventas.findOne({
      where: { id },
      relations: { detalle: true },
    });
    if (!venta) {
      throw new ErrorNegocio(404, 'VENTA_NO_ENCONTRADA', [
        `No existe la venta ${id}`,
      ]);
    }
    return aVentaApi(venta, true);
  }

  async buscar(f: BuscarVentasDto): Promise<Pagina<VentaApi>> {
    this.validarRango(f.desde, f.hasta);
    const qb = this.ventas.createQueryBuilder('v');
    if (f.desde)
      qb.andWhere(`(v.created_at AT TIME ZONE '${ZONA}')::date >= :desde`, {
        desde: f.desde,
      });
    if (f.hasta)
      qb.andWhere(`(v.created_at AT TIME ZONE '${ZONA}')::date <= :hasta`, {
        hasta: f.hasta,
      });
    if (f.estado) qb.andWhere('v.estado = :estado', { estado: f.estado });
    if (f.metodo_pago)
      qb.andWhere('v.metodo_pago = :metodo', { metodo: f.metodo_pago });
    if (f.cliente_id)
      qb.andWhere('v.cliente_id = :cliente', { cliente: f.cliente_id });
    if (f.vendedor_id)
      qb.andWhere('v.vendedor_id = :vendedor', { vendedor: f.vendedor_id });
    qb.orderBy('v.created_at', 'DESC')
      .offset((f.page - 1) * f.limit)
      .limit(f.limit);
    const [ventas, total] = await qb.getManyAndCount();
    return {
      items: ventas.map((v) => aVentaApi(v, false)),
      meta: { page: f.page, limit: f.limit, total },
    };
  }

  /** KPIs del dashboard ejecutivo. Solo cuentan ventas CONFIRMADA. */
  async dashboard(f: DashboardDto) {
    const [hoy] = await this.dataSource.query<
      { hoy: string; inicio_mes: string }[]
    >(
      `SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS hoy,
              to_char(date_trunc('month', now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS inicio_mes`,
      [ZONA],
    );
    const desde = f.desde ?? hoy.inicio_mes;
    const hasta = f.hasta ?? hoy.hoy;
    this.validarRango(desde, hasta);
    const filtro = `v.estado = 'CONFIRMADA' AND (v.created_at AT TIME ZONE '${ZONA}')::date BETWEEN $1::date AND $2::date`;

    const [totales] = await this.dataSource.query<Record<string, string>[]>(
      `SELECT COUNT(*) AS ventas,
              COALESCE(SUM(v.total_vendido), 0)::numeric(14,2)::text AS total_vendido,
              COALESCE(SUM(v.costo_total_jrs), 0)::numeric(14,2)::text AS costo_total_jrs,
              COALESCE(SUM(v.ganancia_total), 0)::numeric(14,2)::text AS ganancia_neta,
              COALESCE(ROUND(AVG(v.total_vendido), 2), 0)::numeric(14,2)::text AS ticket_promedio,
              COALESCE(ROUND(100 * SUM(v.ganancia_total) / NULLIF(SUM(v.total_vendido), 0), 2), 0)::text AS margen_porcentaje
         FROM ventas v WHERE ${filtro}`,
      [desde, hasta],
    );
    const [unidades] = await this.dataSource.query<{ unidades: string }[]>(
      `SELECT COALESCE(SUM(d.cantidad), 0) AS unidades
         FROM detalle_ventas d JOIN ventas v ON v.id = d.venta_id WHERE ${filtro}`,
      [desde, hasta],
    );
    // Ventas con al menos una línea cuyo costo era 0.00 al vender (costo aún no cargado):
    // su ganancia es mayor que la real, así que el dashboard debe advertirlo.
    const [sinCosto] = await this.dataSource.query<{ ventas: string }[]>(
      `SELECT COUNT(DISTINCT d.venta_id) AS ventas
         FROM detalle_ventas d JOIN ventas v ON v.id = d.venta_id
        WHERE ${filtro} AND d.valor_jersey_club_unitario = 0`,
      [desde, hasta],
    );
    const porMetodo = await this.dataSource.query<Record<string, string>[]>(
      `SELECT m.metodo_pago, COUNT(v.id) AS ventas,
              COALESCE(SUM(v.total_vendido), 0)::numeric(14,2)::text AS total_vendido,
              COALESCE(SUM(v.ganancia_total), 0)::numeric(14,2)::text AS ganancia_total
         FROM (VALUES ('TRANSFERENCIA'), ('EFECTIVO'), ('TARJETA')) AS m(metodo_pago)
         LEFT JOIN ventas v ON v.metodo_pago = m.metodo_pago AND ${filtro}
        GROUP BY m.metodo_pago ORDER BY SUM(v.total_vendido) DESC NULLS LAST, m.metodo_pago`,
      [desde, hasta],
    );
    const top = await this.dataSource.query<Record<string, string>[]>(
      `SELECT d.snapshot_producto->>'producto_id' AS producto_id,
              d.snapshot_producto->>'nombre' AS nombre,
              d.snapshot_producto->>'marca_equipo' AS marca_equipo,
              d.snapshot_producto->>'temporada_coleccion' AS temporada_coleccion,
              SUM(d.cantidad) AS unidades,
              SUM(d.subtotal)::numeric(14,2)::text AS total_vendido,
              SUM(d.ganancia_linea)::numeric(14,2)::text AS ganancia_total
         FROM detalle_ventas d JOIN ventas v ON v.id = d.venta_id
        WHERE ${filtro}
        GROUP BY 1, 2, 3, 4
        ORDER BY SUM(d.cantidad) DESC, SUM(d.subtotal) DESC
        LIMIT 5`,
      [desde, hasta],
    );

    return {
      periodo: { desde, hasta, zona_horaria: ZONA },
      ventas_confirmadas: Number(totales.ventas),
      unidades_vendidas: Number(unidades.unidades),
      ventas_sin_costo: Number(sinCosto.ventas),
      total_vendido: totales.total_vendido,
      costo_total_jrs: totales.costo_total_jrs,
      ganancia_neta: totales.ganancia_neta,
      margen_porcentaje: totales.margen_porcentaje,
      ticket_promedio: totales.ticket_promedio,
      por_metodo_pago: porMetodo.map((r) => ({
        metodo_pago: r.metodo_pago,
        ventas: Number(r.ventas),
        total_vendido: r.total_vendido,
        ganancia_total: r.ganancia_total,
      })),
      top_productos: top.map((r) => ({
        producto_id: r.producto_id,
        nombre: r.nombre,
        marca_equipo: r.marca_equipo,
        temporada_coleccion: r.temporada_coleccion,
        unidades: Number(r.unidades),
        total_vendido: r.total_vendido,
        ganancia_total: r.ganancia_total,
      })),
    };
  }

  private validarRango(desde?: string, hasta?: string): void {
    if (desde && hasta && desde > hasta) {
      throw new ErrorNegocio(400, 'VALIDACION_FALLIDA', [
        'desde no puede ser posterior a hasta',
      ]);
    }
  }
}
