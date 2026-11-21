import type { ValueTransformer } from 'typeorm';

/**
 * Columnas NUMERIC(10,2): se manejan como texto con 2 decimales ("30.00").
 * El driver `pg` ya entrega NUMERIC como string exacto; no se convierte a
 * number para no perder precisión. Los cálculos de dinero se hacen en SQL o
 * en centavos enteros, nunca con punto flotante.
 */
export const decimalTransformer: ValueTransformer = {
  to: (valor: string | null | undefined) => valor,
  from: (valor: string | null) => valor,
};
