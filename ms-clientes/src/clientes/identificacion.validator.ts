import type { TipoIdentificacion } from './entities/cliente.entity';
import { CONSUMIDOR_FINAL_IDENTIFICACION } from './entities/cliente.entity';

/** Códigos de provincia válidos en Ecuador: 01–24 y 30 (ecuatorianos en el exterior). */
function provinciaValida(dosDigitos: string): boolean {
  const p = Number(dosDigitos);
  return (p >= 1 && p <= 24) || p === 30;
}

/**
 * Cédula ecuatoriana: 10 dígitos, provincia válida, tercer dígito < 6 y
 * dígito verificador módulo 10 (coeficientes 2,1,2,1,2,1,2,1,2).
 */
export function validarCedula(cedula: string): string | null {
  if (!/^\d{10}$/.test(cedula)) return 'La cédula debe tener 10 dígitos';
  if (!provinciaValida(cedula.slice(0, 2))) {
    return `La cédula ${cedula} tiene un código de provincia inválido`;
  }
  if (Number(cedula[2]) >= 6) {
    return `La cédula ${cedula} tiene un tercer dígito inválido (debe ser 0-5)`;
  }
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let producto = Number(cedula[i]) * (i % 2 === 0 ? 2 : 1);
    if (producto > 9) producto -= 9;
    suma += producto;
  }
  const verificador = (10 - (suma % 10)) % 10;
  if (verificador !== Number(cedula[9])) {
    return `La cédula ${cedula} no supera el dígito verificador (módulo 10)`;
  }
  return null;
}

/**
 * RUC: 13 dígitos terminados en 001, provincia válida y tercer dígito
 * 0-5 (persona natural), 6 (sector público) o 9 (sociedad privada).
 * Para personas naturales los 10 primeros dígitos deben ser una cédula válida.
 * Para sociedades y sector público no se aplica el módulo 11: el SRI emite
 * RUC vigentes que no lo cumplen, y rechazarlos bloquearía ventas reales.
 */
export function validarRuc(ruc: string): string | null {
  if (!/^\d{13}$/.test(ruc)) return 'El RUC debe tener 13 dígitos';
  if (!ruc.endsWith('001')) return `El RUC ${ruc} debe terminar en 001`;
  if (!provinciaValida(ruc.slice(0, 2))) {
    return `El RUC ${ruc} tiene un código de provincia inválido`;
  }
  const tercero = Number(ruc[2]);
  if (tercero <= 5) {
    const error = validarCedula(ruc.slice(0, 10));
    return error ? `RUC de persona natural inválido: ${error}` : null;
  }
  if (tercero === 6 || tercero === 9) return null;
  return `El RUC ${ruc} tiene un tercer dígito inválido (0-6 o 9)`;
}

export function validarPasaporte(pasaporte: string): string | null {
  return /^[A-Z0-9]{5,20}$/.test(pasaporte)
    ? null
    : 'El pasaporte debe ser alfanumérico de 5 a 20 caracteres';
}

/** Normaliza (sin espacios ni guiones; pasaporte en mayúsculas). */
export function normalizarIdentificacion(
  tipo: TipoIdentificacion,
  valor: string,
): string {
  const limpio = valor.replace(/[\s-]/g, '');
  return tipo === 'PASAPORTE' ? limpio.toUpperCase() : limpio;
}

/** Devuelve el mensaje de error o null si la identificación es válida. */
export function validarIdentificacion(
  tipo: TipoIdentificacion,
  identificacion: string,
): string | null {
  switch (tipo) {
    case 'CEDULA':
      return validarCedula(identificacion);
    case 'RUC':
      return validarRuc(identificacion);
    case 'PASAPORTE':
      return validarPasaporte(identificacion);
    case 'CONSUMIDOR_FINAL':
      return identificacion === CONSUMIDOR_FINAL_IDENTIFICACION
        ? null
        : `CONSUMIDOR_FINAL debe usar la identificación ${CONSUMIDOR_FINAL_IDENTIFICACION}`;
    default:
      return 'Tipo de identificación no soportado';
  }
}
