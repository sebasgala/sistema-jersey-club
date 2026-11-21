/** Tipos de la API del gateway (contracts/*.openapi.yaml). Dinero siempre como texto "45.00". */

export interface Meta {
  page: number;
  limit: number;
  total: number;
}

export interface Pagina<T> {
  items: T[];
  meta: Meta;
}

export interface Producto {
  id: string;
  categoria: string;
  nombre: string;
  marca_equipo: string;
  temporada_coleccion: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Variante {
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
  created_at: string;
  updated_at: string;
  producto?: Producto;
}

export interface KpisInventario {
  total_skus: number;
  skus_con_stock: number;
  unidades_stock: number;
  valorizacion_costo_jrs: string;
  valorizacion_pvp: string;
  skus_sin_costo: number;
}

export type PaginaVariantes = Pagina<Variante> & { kpis: KpisInventario };

export interface MovimientoStock {
  id: string;
  variante_id: string;
  tipo: "SALDO_INICIAL" | "VENTA" | "REVERSION_VENTA" | "AJUSTE_ENTRADA" | "AJUSTE_SALIDA";
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  costo_unitario: string | null;
  observacion: string | null;
  created_at: string;
}

export type TipoIdentificacion = "CEDULA" | "RUC" | "PASAPORTE" | "CONSUMIDOR_FINAL";
export type Courier = "SERVIENTREGA" | "LAAR_COURIER" | "ENTREGA_QUITO" | "OTRO";

export interface Cliente {
  id: string;
  tipo_identificacion: TipoIdentificacion;
  identificacion: string;
  nombre_completo: string;
  telefono: string | null;
  email: string | null;
  provincia: string | null;
  ciudad: string | null;
  direccion_referencia: string | null;
  courier_preferido: Courier;
}

export type MetodoPago = "TRANSFERENCIA" | "EFECTIVO" | "TARJETA";
export type EstadoVenta = "PENDIENTE" | "CONFIRMADA" | "RECHAZADA" | "FALLIDA";

export interface SnapshotProducto {
  variante_id: string;
  codigo_legacy: string | null;
  nombre: string;
  marca_equipo: string;
  temporada_coleccion: string | null;
  talla_medida: string;
  version_modelo: string;
  adicional_parche: string | null;
  adicional_dorsal: string | null;
}

export interface DetalleVenta {
  id: string;
  variante_id: string;
  snapshot_producto: SnapshotProducto;
  cantidad: number;
  precio_venta_unitario: string;
  valor_jersey_club_unitario: string;
  subtotal: string;
  ganancia_linea: string;
}

export interface Venta {
  id: string;
  numero_comprobante: string;
  cliente_id: string;
  cliente_snapshot: {
    nombre_completo?: string;
    identificacion?: string;
    tipo_identificacion?: string;
    origen?: string;
    ciudad?: string | null;
  };
  vendedor_id: string | null;
  metodo_pago: MetodoPago;
  estado: EstadoVenta;
  total_vendido: string;
  costo_total_jrs: string;
  ganancia_total: string;
  observacion: string | null;
  created_at: string;
  detalle?: DetalleVenta[];
}

export interface Dashboard {
  periodo: { desde: string; hasta: string; zona_horaria: string };
  ventas_confirmadas: number;
  unidades_vendidas: number;
  total_vendido: string;
  costo_total_jrs: string;
  ganancia_neta: string;
  margen_porcentaje: string;
  ticket_promedio: string;
  por_metodo_pago: { metodo_pago: MetodoPago; ventas: number; total_vendido: string; ganancia_total: string }[];
  top_productos: {
    producto_id: string;
    nombre: string;
    marca_equipo: string;
    temporada_coleccion: string | null;
    unidades: number;
    total_vendido: string;
    ganancia_total: string;
  }[];
}

export const CATEGORIAS = ["CAMISETA", "CHOMPA", "CANILLERAS", "GORRA", "ACCESORIO"] as const;
export const TALLAS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "ÚNICA"] as const;
export const VERSIONES = ["JUGADOR", "FAN", "RETRO", "PILOTO"] as const;
export const METODOS_PAGO: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia" },
  { valor: "EFECTIVO", etiqueta: "Efectivo" },
  { valor: "TARJETA", etiqueta: "Tarjeta" },
];
export const COURIERS: { valor: Courier; etiqueta: string }[] = [
  { valor: "SERVIENTREGA", etiqueta: "Servientrega" },
  { valor: "LAAR_COURIER", etiqueta: "Laar Courier" },
  { valor: "ENTREGA_QUITO", etiqueta: "Entrega en Quito" },
  { valor: "OTRO", etiqueta: "Otro" },
];
export const PROVINCIAS = [
  "Azuay", "Bolívar", "Cañar", "Carchi", "Chimborazo", "Cotopaxi", "El Oro", "Esmeraldas",
  "Galápagos", "Guayas", "Imbabura", "Loja", "Los Ríos", "Manabí", "Morona Santiago", "Napo",
  "Orellana", "Pastaza", "Pichincha", "Santa Elena", "Santo Domingo de los Tsáchilas",
  "Sucumbíos", "Tungurahua", "Zamora Chinchipe",
] as const;
export const CONSUMIDOR_FINAL_ID = "00000000-0000-4000-8000-000000000001";
