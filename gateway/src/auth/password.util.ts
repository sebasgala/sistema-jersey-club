import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hash de contraseña con scrypt (biblioteca estándar de Node).
 * Formato: scrypt:<sal base64url>:<hash base64url>  (N=16384, r=8, p=1, 64 bytes)
 * Se usa ':' como separador para que el valor sea seguro en archivos .env.
 */
const LONGITUD = 64;

export function generarHash(contrasena: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(contrasena, sal, LONGITUD);
  return `scrypt:${sal.toString('base64url')}:${hash.toString('base64url')}`;
}

export function verificarHash(contrasena: string, almacenado: string): boolean {
  const [algoritmo, salB64, hashB64] = almacenado.split(':');
  if (algoritmo !== 'scrypt' || !salB64 || !hashB64) return false;
  const esperado = Buffer.from(hashB64, 'base64url');
  if (esperado.length !== LONGITUD) return false;
  const calculado = scryptSync(
    contrasena,
    Buffer.from(salB64, 'base64url'),
    esperado.length,
  );
  return timingSafeEqual(esperado, calculado);
}

/** Comparación de textos en tiempo constante. */
export function igualesSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
