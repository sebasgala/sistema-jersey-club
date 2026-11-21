export const URLS_SERVICIOS = Symbol('URLS_SERVICIOS');

export interface UrlsServicios {
  inventario: string;
  clientes: string;
  timeoutInventarioMs: number;
  timeoutClientesMs: number;
}
