/**
 * Dinero en centavos enteros: nunca se opera con punto flotante.
 * En la API y en la base el dinero viaja como texto "45.00".
 */
export const PATRON_DINERO = /^\d{1,8}(\.\d{1,2})?$/;

export function aCentavos(valor: string | number): number {
  const texto = typeof valor === 'number' ? valor.toFixed(2) : valor.trim();
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(texto);
  if (!m) throw new Error(`Monto inválido: ${texto}`);
  const centavos = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] === '-' ? -centavos : centavos;
}

export function deCentavos(centavos: number): string {
  const signo = centavos < 0 ? '-' : '';
  const abs = Math.abs(centavos);
  return `${signo}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Normaliza la entrada (número o texto) a "0.00" para validarla con PATRON_DINERO. */
export function normalizarDinero({ value }: { value: unknown }): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  if (typeof value === 'string' && PATRON_DINERO.test(value.trim())) {
    return deCentavos(aCentavos(value));
  }
  return value;
}
