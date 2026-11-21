import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { aCentavos } from '../common/dinero.util';
import { ErrorNegocio } from '../common/errores.filter';
import { type Pagina, patronLike } from '../common/http.util';
import { Producto } from '../productos/entities/producto.entity';
import type {
  ActualizarPreciosDto,
  ActualizarVarianteDto,
  BuscarVariantesDto,
  CrearVarianteDto,
} from './dto/variante.dto';
import { Variante } from './entities/variante.entity';
import { aVarianteApi, type VarianteApi } from './variante.mapper';

export interface KpisInventario {
  total_skus: number;
  skus_con_stock: number;
  unidades_stock: number;
  valorizacion_costo_jrs: string;
  valorizacion_pvp: string;
  skus_sin_costo: number;
}

/** Orden natural de tallas para listados. */
const ORDEN_TALLA = `CASE v.talla_medida
  WHEN 'XXS' THEN 1 WHEN 'XS' THEN 2 WHEN 'S' THEN 3 WHEN 'M' THEN 4 WHEN 'L' THEN 5
  WHEN 'XL' THEN 6 WHEN 'XXL' THEN 7 WHEN 'XXXL' THEN 8 ELSE 99 END`;

@Injectable()
export class VariantesService {
  constructor(
    @InjectRepository(Variante) private readonly repo: Repository<Variante>,
    @InjectRepository(Producto)
    private readonly productos: Repository<Producto>,
  ) {}

  async buscar(
    filtro: BuscarVariantesDto,
  ): Promise<Pagina<VarianteApi> & { kpis: KpisInventario }> {
    const qb = this.filtrar(
      this.repo.createQueryBuilder('v').innerJoinAndSelect('v.producto', 'p'),
      filtro,
    )
      .orderBy('p.marca_equipo', 'ASC')
      .addOrderBy('p.nombre', 'ASC')
      .addOrderBy('p.temporada_coleccion', 'ASC', 'NULLS LAST')
      .addOrderBy(ORDEN_TALLA, 'ASC')
      .addOrderBy('v.talla_medida', 'ASC')
      .addOrderBy('v.codigo_legacy', 'ASC')
      .offset((filtro.page - 1) * filtro.limit)
      .limit(filtro.limit);

    const kpisQb = this.filtrar(
      this.repo.createQueryBuilder('v').innerJoin('v.producto', 'p'),
      filtro,
    )
      .select('COUNT(*)', 'total_skus')
      .addSelect('COUNT(*) FILTER (WHERE v.stock_actual > 0)', 'skus_con_stock')
      .addSelect('COALESCE(SUM(v.stock_actual), 0)', 'unidades_stock')
      .addSelect(
        'COALESCE(SUM(v.stock_actual * v.valor_jersey_club), 0)::numeric(14,2)::text',
        'valorizacion_costo_jrs',
      )
      .addSelect(
        'COALESCE(SUM(v.stock_actual * v.pvp_sugerido), 0)::numeric(14,2)::text',
        'valorizacion_pvp',
      )
      .addSelect(
        'COUNT(*) FILTER (WHERE v.valor_jersey_club = 0)',
        'skus_sin_costo',
      );

    const [[variantes, total], k] = await Promise.all([
      qb.getManyAndCount(),
      kpisQb.getRawOne<Record<keyof KpisInventario, string>>(),
    ]);
    return {
      items: variantes.map(aVarianteApi),
      meta: { page: filtro.page, limit: filtro.limit, total },
      kpis: {
        total_skus: Number(k?.total_skus ?? 0),
        skus_con_stock: Number(k?.skus_con_stock ?? 0),
        unidades_stock: Number(k?.unidades_stock ?? 0),
        valorizacion_costo_jrs: k?.valorizacion_costo_jrs ?? '0.00',
        valorizacion_pvp: k?.valorizacion_pvp ?? '0.00',
        skus_sin_costo: Number(k?.skus_sin_costo ?? 0),
      },
    };
  }

  async obtener(id: string): Promise<VarianteApi> {
    return aVarianteApi(await this.cargar(id, true));
  }

  async crear(dto: CrearVarianteDto): Promise<VarianteApi> {
    if (!(await this.productos.exists({ where: { id: dto.producto_id } }))) {
      throw new ErrorNegocio(404, 'PRODUCTO_NO_ENCONTRADO', [
        `No existe el producto ${dto.producto_id}`,
      ]);
    }
    const variante = this.repo.create({
      productoId: dto.producto_id,
      codigoLegacy: dto.codigo_legacy ?? null,
      tallaMedida: dto.talla_medida,
      versionModelo: dto.version_modelo,
      adicionalParche: dto.adicional_parche || null,
      adicionalDorsal: dto.adicional_dorsal || null,
      observaciones: dto.observaciones || null,
      stockActual: 0,
      valorJerseyClub: dto.valor_jersey_club ?? '0.00',
      pvpSugerido: dto.pvp_sugerido ?? '0.00',
    });
    await this.verificarUnicidad(variante);
    const guardada = await this.guardar(variante);
    return this.obtener(guardada.id);
  }

  async actualizar(
    id: string,
    dto: ActualizarVarianteDto,
  ): Promise<VarianteApi> {
    const variante = await this.cargar(id, false);
    if (dto.codigo_legacy !== undefined)
      variante.codigoLegacy = dto.codigo_legacy || null;
    if (dto.talla_medida !== undefined) variante.tallaMedida = dto.talla_medida;
    if (dto.version_modelo !== undefined)
      variante.versionModelo = dto.version_modelo;
    if (dto.adicional_parche !== undefined) {
      variante.adicionalParche = dto.adicional_parche || null;
    }
    if (dto.adicional_dorsal !== undefined) {
      variante.adicionalDorsal = dto.adicional_dorsal || null;
    }
    if (dto.observaciones !== undefined)
      variante.observaciones = dto.observaciones || null;
    if (dto.activo !== undefined) variante.activo = dto.activo;
    await this.verificarUnicidad(variante);
    await this.guardar(variante);
    return this.obtener(id);
  }

  /** Actualización ágil de costo JRS y PVP (carga de costos pendientes). */
  async actualizarPrecios(
    id: string,
    dto: ActualizarPreciosDto,
  ): Promise<{ variante: VarianteApi; advertencias: string[] }> {
    if (dto.valor_jersey_club === undefined && dto.pvp_sugerido === undefined) {
      throw new ErrorNegocio(400, 'VALIDACION_FALLIDA', [
        'Envíe valor_jersey_club, pvp_sugerido o ambos',
      ]);
    }
    const variante = await this.cargar(id, false);
    if (dto.valor_jersey_club !== undefined)
      variante.valorJerseyClub = dto.valor_jersey_club;
    if (dto.pvp_sugerido !== undefined) variante.pvpSugerido = dto.pvp_sugerido;
    await this.repo.update(
      { id },
      {
        valorJerseyClub: variante.valorJerseyClub,
        pvpSugerido: variante.pvpSugerido,
      },
    );
    const advertencias: string[] = [];
    const costo = aCentavos(variante.valorJerseyClub);
    const pvp = aCentavos(variante.pvpSugerido);
    if (pvp > 0 && pvp < costo) {
      advertencias.push(
        `El PVP sugerido (${variante.pvpSugerido}) es menor que el costo JRS (${variante.valorJerseyClub})`,
      );
    }
    return { variante: await this.obtener(id), advertencias };
  }

  private filtrar(
    qb: SelectQueryBuilder<Variante>,
    f: BuscarVariantesDto,
  ): SelectQueryBuilder<Variante> {
    qb.where('v.activo = :activo', { activo: f.activo ?? true });
    if (f.producto_id)
      qb.andWhere('v.producto_id = :pid', { pid: f.producto_id });
    if (f.categoria)
      qb.andWhere('p.categoria = :categoria', { categoria: f.categoria });
    if (f.marca_equipo) {
      qb.andWhere('p.marca_equipo ILIKE :marca', {
        marca: patronLike(f.marca_equipo),
      });
    }
    if (f.temporada)
      qb.andWhere('p.temporada_coleccion = :temporada', {
        temporada: f.temporada,
      });
    if (f.talla_medida)
      qb.andWhere('v.talla_medida = :talla', { talla: f.talla_medida });
    if (f.version_modelo) {
      qb.andWhere('v.version_modelo = :version', { version: f.version_modelo });
    }
    if (f.adicional_parche) {
      qb.andWhere('v.adicional_parche ILIKE :parche', {
        parche: patronLike(f.adicional_parche),
      });
    }
    if (f.adicional_dorsal) {
      qb.andWhere('v.adicional_dorsal ILIKE :dorsal', {
        dorsal: patronLike(f.adicional_dorsal),
      });
    }
    if (f.codigo_legacy)
      qb.andWhere('v.codigo_legacy = :codigo', { codigo: f.codigo_legacy });
    if (f.busqueda) {
      qb.andWhere(
        `(p.nombre ILIKE :b OR p.marca_equipo ILIKE :b OR p.temporada_coleccion ILIKE :b
          OR v.codigo_legacy ILIKE :b OR v.adicional_parche ILIKE :b
          OR v.adicional_dorsal ILIKE :b OR v.observaciones ILIKE :b)`,
        { b: patronLike(f.busqueda) },
      );
    }
    if (f.solo_disponibles) qb.andWhere('v.stock_actual > 0');
    if (f.sin_costo) qb.andWhere('v.valor_jersey_club = 0');
    return qb;
  }

  /** Verifica el índice único exacto antes de escribir, para responder 409 con detalle. */
  private async verificarUnicidad(v: Variante): Promise<void> {
    const qb = this.repo
      .createQueryBuilder('v')
      .where('v.producto_id = :pid', { pid: v.productoId })
      .andWhere('v.talla_medida = :talla', { talla: v.tallaMedida })
      .andWhere('v.version_modelo = :version', { version: v.versionModelo })
      .andWhere("COALESCE(v.adicional_parche, '') = :parche", {
        parche: v.adicionalParche ?? '',
      })
      .andWhere("COALESCE(v.adicional_dorsal, '') = :dorsal", {
        dorsal: v.adicionalDorsal ?? '',
      });
    if (v.id) qb.andWhere('v.id <> :id', { id: v.id });
    const existente = await qb.getOne();
    if (existente) {
      throw new ErrorNegocio(409, 'VARIANTE_DUPLICADA', [
        `Ya existe la variante ${existente.id} (${existente.codigoLegacy ?? 'sin código'}) con ese producto, talla, versión, parche y dorsal`,
      ]);
    }
    if (v.codigoLegacy) {
      const conCodigo = await this.repo.findOne({
        where: { codigoLegacy: v.codigoLegacy },
      });
      if (conCodigo && conCodigo.id !== v.id) {
        throw new ErrorNegocio(409, 'CODIGO_LEGACY_DUPLICADO', [
          `El código ${v.codigoLegacy} ya pertenece a la variante ${conCodigo.id}`,
        ]);
      }
    }
  }

  private async guardar(v: Variante): Promise<Variante> {
    try {
      return await this.repo.save(v);
    } catch (e) {
      if (e instanceof QueryFailedError) {
        const err = e.driverError as { code?: string; constraint?: string };
        if (err.code === '23505') {
          throw new ErrorNegocio(409, 'VARIANTE_DUPLICADA', [
            `La variante incumple la restricción única ${err.constraint ?? ''}`.trim(),
          ]);
        }
      }
      throw e;
    }
  }

  private async cargar(id: string, conProducto: boolean): Promise<Variante> {
    const variante = await this.repo.findOne({
      where: { id },
      relations: conProducto ? { producto: true } : undefined,
    });
    if (!variante) {
      throw new ErrorNegocio(404, 'VARIANTE_NO_ENCONTRADA', [
        `No existe la variante ${id}`,
      ]);
    }
    return variante;
  }
}
