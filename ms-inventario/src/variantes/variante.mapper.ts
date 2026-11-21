import type { Producto } from '../productos/entities/producto.entity';
import type { MovimientoStock } from '../stock/entities/movimiento-stock.entity';
import type { Variante } from './entities/variante.entity';

export interface ProductoApi {
  id: string;
  categoria: string;
  nombre: string;
  marca_equipo: string;
  temporada_coleccion: string | null;
  activo: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface VarianteApi {
  id: string;
  producto_id: string;
  codigo_legacy: string | null;
  talla_medida: string;
  version_modelo: string;
  adicional_parche: string | null;
  adicional_dorsal: string | null;
  observaciones: string | null;
  stock_actual: number;
  valor_jersey_club: string;
  pvp_sugerido: string;
  activo: boolean;
  created_at: Date;
  updated_at: Date;
  producto?: ProductoApi;
}

/** Datos congelados que ms-ventas guarda en detalle_ventas.snapshot_producto. */
export interface SnapshotVariante {
  variante_id: string;
  producto_id: string;
  codigo_legacy: string | null;
  categoria: string;
  nombre: string;
  marca_equipo: string;
  temporada_coleccion: string | null;
  talla_medida: string;
  version_modelo: string;
  adicional_parche: string | null;
  adicional_dorsal: string | null;
  valor_jersey_club: string;
  pvp_sugerido: string;
}

export interface MovimientoApi {
  id: string;
  variante_id: string;
  tipo: string;
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  costo_unitario: string | null;
  idempotency_key: string | null;
  referencia_id: string | null;
  observacion: string | null;
  created_at: Date;
}

export function aProductoApi(p: Producto): ProductoApi {
  return {
    id: p.id,
    categoria: p.categoria,
    nombre: p.nombre,
    marca_equipo: p.marcaEquipo,
    temporada_coleccion: p.temporadaColeccion,
    activo: p.activo,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function aVarianteApi(v: Variante): VarianteApi {
  return {
    id: v.id,
    producto_id: v.productoId,
    codigo_legacy: v.codigoLegacy,
    talla_medida: v.tallaMedida,
    version_modelo: v.versionModelo,
    adicional_parche: v.adicionalParche,
    adicional_dorsal: v.adicionalDorsal,
    observaciones: v.observaciones,
    stock_actual: v.stockActual,
    valor_jersey_club: v.valorJerseyClub,
    pvp_sugerido: v.pvpSugerido,
    activo: v.activo,
    created_at: v.createdAt,
    updated_at: v.updatedAt,
    ...(v.producto ? { producto: aProductoApi(v.producto) } : {}),
  };
}

export function aSnapshot(
  v: Variante,
  p: Producto,
  costoCongelado?: string | null,
): SnapshotVariante {
  return {
    variante_id: v.id,
    producto_id: p.id,
    codigo_legacy: v.codigoLegacy,
    categoria: p.categoria,
    nombre: p.nombre,
    marca_equipo: p.marcaEquipo,
    temporada_coleccion: p.temporadaColeccion,
    talla_medida: v.tallaMedida,
    version_modelo: v.versionModelo,
    adicional_parche: v.adicionalParche,
    adicional_dorsal: v.adicionalDorsal,
    valor_jersey_club: costoCongelado ?? v.valorJerseyClub,
    pvp_sugerido: v.pvpSugerido,
  };
}

export function aMovimientoApi(m: MovimientoStock): MovimientoApi {
  return {
    id: m.id,
    variante_id: m.varianteId,
    tipo: m.tipo,
    cantidad: m.cantidad,
    stock_anterior: m.stockAnterior,
    stock_nuevo: m.stockNuevo,
    costo_unitario: m.costoUnitario,
    idempotency_key: m.idempotencyKey,
    referencia_id: m.referenciaId,
    observacion: m.observacion,
    created_at: m.createdAt,
  };
}
