import type { UsuarioToken } from '../auth/auth.guard';

type Rol = UsuarioToken['role'];

/**
 * Permisos por rol, aplicados en el gateway (los microservicios confían en él).
 *
 *  ADMIN     → todo.
 *  VENDEDOR  → leer catálogo, stock, clientes y ventas; registrar ventas; crear y editar clientes.
 *              No puede: crear/editar productos o variantes, cambiar precios o costos, ajustar stock
 *              (ni llamar directamente a descuentos/reversiones) ni anular ventas.
 */
export function rolPermitido(
  rol: Rol,
  metodo: string,
  segmentos: string[],
): boolean {
  if (rol === 'ADMIN') return true;
  const [recurso, ...resto] = segmentos;
  const lectura = ['GET', 'HEAD', 'OPTIONS'].includes(metodo);
  switch (recurso) {
    case 'clientes':
      return true;
    case 'ventas':
      return lectura || (metodo === 'POST' && resto.length === 0);
    default:
      // productos, variantes, stock
      return lectura;
  }
}

/** Campos de costo y ganancia: un VENDEDOR nunca los recibe, ni siquiera por la red. */
const CAMPOS_COSTO = new Set([
  'valor_jersey_club',
  'valor_jersey_club_unitario',
  'costo_unitario',
  'costo_total_jrs',
  'ganancia_total',
  'ganancia_linea',
  'ganancia_neta',
  'margen_porcentaje',
  'valorizacion_costo_jrs',
]);

/** Las observaciones migradas del Excel pueden traer "Costo 30.00 y PVP 45.00 rescatados…". */
function limpiarObservaciones(texto: string): string | null {
  const partes = texto.split(' | ').filter((p) => !/^Costo\s+\d/.test(p));
  return partes.length ? partes.join(' | ') : null;
}

export function ocultarCostos(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ocultarCostos);
  if (valor && typeof valor === 'object') {
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor)) {
      if (CAMPOS_COSTO.has(clave)) continue;
      salida[clave] =
        clave === 'observaciones' && typeof v === 'string'
          ? limpiarObservaciones(v)
          : ocultarCostos(v);
    }
    return salida;
  }
  return valor;
}
