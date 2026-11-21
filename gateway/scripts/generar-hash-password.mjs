#!/usr/bin/env node
// Genera el valor de ADMIN_PASSWORD_HASH para gateway/.env (mismo formato que src/auth/password.util.ts).
// Uso:  npm run hash-password -- "mi contraseña segura"
//       (sin argumento, lee la contraseña desde stdin)
import { randomBytes, scryptSync } from 'node:crypto';

async function leerContrasena() {
  if (process.argv[2]) return process.argv[2];
  let texto = '';
  for await (const parte of process.stdin) texto += parte;
  return texto.replace(/\r?\n$/, '');
}

const contrasena = await leerContrasena();
if (contrasena.length < 10) {
  console.error('La contraseña debe tener al menos 10 caracteres');
  process.exit(1);
}
const sal = randomBytes(16);
const hash = scryptSync(contrasena, sal, 64);
console.log(`scrypt:${sal.toString('base64url')}:${hash.toString('base64url')}`);
