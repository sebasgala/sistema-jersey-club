import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ErrorNegocio } from '../common/errores.filter';
import { type Pagina, patronLike } from '../common/http.util';
import {
  aProductoApi,
  aVarianteApi,
  type ProductoApi,
  type VarianteApi,
} from '../variantes/variante.mapper';
import type {
  ActualizarProductoDto,
  BuscarProductosDto,
  CrearProductoDto,
} from './dto/producto.dto';
import { Producto } from './entities/producto.entity';

@Injectable()
export class ProductosService {
  constructor(
    @InjectRepository(Producto) private readonly repo: Repository<Producto>,
  ) {}

  async buscar(filtro: BuscarProductosDto): Promise<Pagina<ProductoApi>> {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.activo = :activo', { activo: filtro.activo ?? true });
    if (filtro.categoria) {
      qb.andWhere('p.categoria = :categoria', { categoria: filtro.categoria });
    }
    if (filtro.marca_equipo) {
      qb.andWhere('p.marca_equipo ILIKE :marca', {
        marca: patronLike(filtro.marca_equipo),
      });
    }
    if (filtro.temporada) {
      qb.andWhere('p.temporada_coleccion = :temporada', {
        temporada: filtro.temporada,
      });
    }
    if (filtro.busqueda) {
      qb.andWhere('(p.nombre ILIKE :b OR p.marca_equipo ILIKE :b)', {
        b: patronLike(filtro.busqueda),
      });
    }
    qb.orderBy('p.marca_equipo', 'ASC')
      .addOrderBy('p.nombre', 'ASC')
      .addOrderBy('p.temporada_coleccion', 'ASC')
      .offset((filtro.page - 1) * filtro.limit)
      .limit(filtro.limit);
    const [productos, total] = await qb.getManyAndCount();
    return {
      items: productos.map(aProductoApi),
      meta: { page: filtro.page, limit: filtro.limit, total },
    };
  }

  async obtener(
    id: string,
  ): Promise<ProductoApi & { variantes: VarianteApi[] }> {
    const producto = await this.repo.findOne({
      where: { id },
      relations: { variantes: true },
    });
    if (!producto) throw this.noEncontrado(id);
    return {
      ...aProductoApi(producto),
      variantes: (producto.variantes ?? []).map(aVarianteApi),
    };
  }

  async crear(dto: CrearProductoDto): Promise<ProductoApi> {
    await this.verificarDuplicado(dto);
    const producto = await this.repo.save(
      this.repo.create({
        categoria: dto.categoria,
        nombre: dto.nombre,
        marcaEquipo: dto.marca_equipo,
        temporadaColeccion: dto.temporada_coleccion ?? null,
      }),
    );
    return aProductoApi(producto);
  }

  async actualizar(
    id: string,
    dto: ActualizarProductoDto,
  ): Promise<ProductoApi> {
    const producto = await this.repo.findOne({ where: { id } });
    if (!producto) throw this.noEncontrado(id);
    if (dto.categoria !== undefined) producto.categoria = dto.categoria;
    if (dto.nombre !== undefined) producto.nombre = dto.nombre;
    if (dto.marca_equipo !== undefined) producto.marcaEquipo = dto.marca_equipo;
    if (dto.temporada_coleccion !== undefined) {
      producto.temporadaColeccion = dto.temporada_coleccion ?? null;
    }
    if (dto.activo !== undefined) producto.activo = dto.activo;
    await this.verificarDuplicado(
      {
        categoria: producto.categoria,
        nombre: producto.nombre,
        marca_equipo: producto.marcaEquipo,
        temporada_coleccion: producto.temporadaColeccion ?? undefined,
      },
      producto.id,
    );
    return aProductoApi(await this.repo.save(producto));
  }

  /** Un producto es único por categoría + nombre + marca + temporada (sin distinguir mayúsculas). */
  private async verificarDuplicado(
    dto: CrearProductoDto,
    excluirId?: string,
  ): Promise<void> {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.categoria = :categoria', { categoria: dto.categoria })
      .andWhere('LOWER(p.nombre) = LOWER(:nombre)', { nombre: dto.nombre })
      .andWhere('LOWER(p.marca_equipo) = LOWER(:marca)', {
        marca: dto.marca_equipo,
      })
      .andWhere("COALESCE(p.temporada_coleccion, '') = :temporada", {
        temporada: dto.temporada_coleccion ?? '',
      });
    if (excluirId) qb.andWhere('p.id <> :id', { id: excluirId });
    const existente = await qb.getOne();
    if (existente) {
      throw new ErrorNegocio(409, 'PRODUCTO_DUPLICADO', [
        `Ya existe el producto ${existente.id}: ${existente.nombre} (${existente.temporadaColeccion ?? 'sin temporada'})`,
      ]);
    }
  }

  private noEncontrado(id: string): ErrorNegocio {
    return new ErrorNegocio(404, 'PRODUCTO_NO_ENCONTRADO', [
      `No existe el producto ${id}`,
    ]);
  }
}
