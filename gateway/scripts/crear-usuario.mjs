#!/usr/bin/env node
// Crea o actualiza un usuario en ms_auth.usuarios (la contraseña se guarda con bcrypt).
//
//   npm run crear-usuario -- <username> <email> "<Nombre Completo>" <ADMIN|VENDEDOR> "<contraseña>"
//
// - Si el username ya existe, se actualizan correo, nombre, rol y contraseña, y se reactiva.
// - La contraseña también puede pasarse por la variable CREAR_USUARIO_PASSWORD para que no
//   quede en el historial de la terminal.
// - Lee la conexión de gateway/.env (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import pg from "pg";

const uso = 'Uso: npm run crear-usuario -- <username> <email> "<Nombre Completo>" <ADMIN|VENDEDOR> "<contraseña>"';
const fallar = (mensaje) => {
  console.error(`Error: ${mensaje}\n${uso}`);
  process.exit(1);
};

const [usernameCrudo, emailCrudo, nombreCrudo, rolCrudo, claveArg] = process.argv.slice(2);
const clave = claveArg ?? process.env.CREAR_USUARIO_PASSWORD;
if (!usernameCrudo || !emailCrudo || !nombreCrudo || !rolCrudo || !clave) fallar("faltan argumentos.");

const username = usernameCrudo.trim().toLowerCase();
const email = emailCrudo.trim().toLowerCase();
const nombre = nombreCrudo.replace(/\s+/g, " ").trim();
const role = rolCrudo.trim().toUpperCase();

if (!/^[a-z0-9._-]{3,50}$/.test(username)) fallar("el username debe tener 3 a 50 caracteres: letras, números, punto, guion o guion bajo.");
if (email.length > 150 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fallar("el correo no es válido.");
if (nombre.length < 2 || nombre.length > 120) fallar("el nombre completo debe tener entre 2 y 120 caracteres.");
if (!["ADMIN", "VENDEDOR"].includes(role)) fallar("el rol debe ser ADMIN o VENDEDOR.");
if (clave.length < 10) fallar("la contraseña debe tener al menos 10 caracteres.");

const archivoEnv = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv);
for (const v of ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
  if (!process.env[v]) fallar(`falta ${v} en gateway/.env.`);
}

const cliente = new pg.Client({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // DB_SSL=true para bases gestionadas (Supabase/Neon).
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

try {
  await cliente.connect();
  const passwordHash = await bcrypt.hash(clave, 12);
  const { rows } = await cliente.query(
    `INSERT INTO ms_auth.usuarios (username, email, nombre_completo, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (username) DO UPDATE
       SET email = EXCLUDED.email,
           nombre_completo = EXCLUDED.nombre_completo,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           activo = TRUE
     RETURNING id, (xmax = 0) AS creado`,
    [username, email, nombre, passwordHash, role],
  );
  console.log(`${rows[0].creado ? "Usuario creado" : "Usuario actualizado"}: ${username} <${email}> · ${role} · ${rows[0].id}`);
} catch (e) {
  if (e.code === "23505") fallar(`el correo ${email} ya pertenece a otro usuario.`);
  if (e.code === "42P01") fallar("no existe ms_auth.usuarios: aplica database/01_schema_mvp_jersey_club.sql.");
  console.error(`Error de base de datos: ${e.message}`);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => {});
}
