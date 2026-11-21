#!/usr/bin/env node
/**
 * Prueba end-to-end del flujo comercial de Jersey Club, siempre a través del gateway.
 *
 * 1. Levanta ms-inventario, ms-ventas, ms-clientes y gateway (node dist/main).
 * 2. Ejecuta: login → variantes/KPIs → clientes → venta → idempotencia → 409 →
 *    concurrencia → compensación → dashboard → ajustes/precios → degradación.
 * 3. Limpia todo lo creado y verifica que el inventario del Excel quedó idéntico.
 * 4. Detiene los procesos.
 *
 * Requisitos: contenedor pg-jersey-club arriba, servicios compilados (npm run build)
 * y la contraseña del administrador en la variable E2E_ADMIN_PASSWORD.
 *
 *   E2E_ADMIN_PASSWORD='...' node pruebas-e2e/flujo-venta.e2e.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATEWAY = process.env.E2E_GATEWAY_URL ?? 'http://localhost:3010/api/v1';
const USUARIO = process.env.E2E_ADMIN_USUARIO ?? 'admin';
const CLAVE = process.env.E2E_ADMIN_PASSWORD;
const SERVICIOS = [
  { nombre: 'ms-inventario', puerto: 3011 },
  { nombre: 'ms-clientes', puerto: 3013 },
  { nombre: 'ms-ventas', puerto: 3012 },
  { nombre: 'gateway', puerto: 3010 },
];
const CEDULA_PRUEBA = '1710034065'; // cédula sintética válida (módulo 10)

if (!CLAVE) {
  console.error('Defina E2E_ADMIN_PASSWORD con la contraseña del administrador del gateway');
  process.exit(2);
}

// ----------------------------------------------------------------------------- utilidades
const env = Object.fromEntries(
  readFileSync(join(RAIZ, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

function sql(consulta) {
  return execFileSync(
    'docker',
    ['exec', '-i', 'pg-jersey-club', 'psql', '-At', '-v', 'ON_ERROR_STOP=1', '-U', env.POSTGRES_USER, '-d', env.POSTGRES_DB],
    { input: consulta, encoding: 'utf8' },
  ).trim();
}
const lista = (ids) => ids.map((id) => `'${id}'`).join(',') || "'00000000-0000-0000-0000-000000000000'";

const resultados = [];
function verificar(condicion, descripcion, detalle = '') {
  resultados.push({ ok: !!condicion, descripcion });
  console.log(`${condicion ? '  ✔' : '  ✘'} ${descripcion}${!condicion && detalle ? `\n      → ${detalle}` : ''}`);
  return !!condicion;
}
const seccion = (t) => console.log(`\n▶ ${t}`);

let token = '';
async function api(metodo, ruta, { cuerpo, cabeceras = {}, sinToken = false } = {}) {
  const res = await fetch(`${GATEWAY}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token && !sinToken ? { Authorization: `Bearer ${token}` } : {}),
      ...cabeceras,
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { json = { texto }; }
  return { status: res.status, headers: res.headers, json };
}
const resumen = (r) => `HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`;

const procesos = new Map();
function arrancar({ nombre }) {
  mkdirSync(join(RAIZ, 'pruebas-e2e', 'logs'), { recursive: true });
  const log = openSync(join(RAIZ, 'pruebas-e2e', 'logs', `${nombre}.log`), 'w');
  const p = spawn(process.execPath, ['dist/main'], { cwd: join(RAIZ, nombre), stdio: ['ignore', log, log] });
  closeSync(log);
  procesos.set(nombre, p);
}
function detener(nombre) {
  const p = procesos.get(nombre);
  if (p && p.exitCode === null) p.kill();
  procesos.delete(nombre);
}
async function esperarSalud(puerto, segundos = 40) {
  for (let i = 0; i < segundos * 4; i++) {
    try {
      const r = await fetch(`http://localhost:${puerto}/api/v1/salud`);
      if (r.status === 200) return true;
    } catch { /* aún arrancando */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
async function puertoLibre(puerto) {
  try { await fetch(`http://localhost:${puerto}/api/v1/salud`); return false; } catch { return true; }
}

const huellaInventario = () =>
  sql(`SELECT md5(string_agg(id || ':' || stock_actual || ':' || valor_jersey_club || ':' || pvp_sugerido || ':' || activo, ',' ORDER BY id))
         || '|' || COUNT(*) || '|' || SUM(stock_actual)
         || '|' || (SELECT COUNT(*) FROM ms_inventario.movimientos_stock)
         || '|' || (SELECT COUNT(*) FROM ms_inventario.productos)
         || '|' || (SELECT COUNT(*) FROM ms_clientes.clientes)
         || '|' || (SELECT COUNT(*) FROM ms_ventas.ventas)
       FROM ms_inventario.variantes;`);
const stockDe = (id) => Number(sql(`SELECT stock_actual FROM ms_inventario.variantes WHERE id = '${id}';`));

// ----------------------------------------------------------------------------- prueba
const creado = { ventas: new Set(), clientes: new Set(), productos: new Set(), clavesAjuste: [] };

async function main() {
  for (const s of SERVICIOS) {
    if (!(await puertoLibre(s.puerto))) throw new Error(`El puerto ${s.puerto} (${s.nombre}) ya está en uso`);
  }
  const huellaInicial = huellaInventario();
  const ventasPrevias = Number(sql('SELECT COUNT(*) FROM ms_ventas.ventas;'));
  console.log(`Huella inicial del inventario: ${huellaInicial}`);

  seccion('Arranque de servicios');
  for (const s of SERVICIOS) {
    arrancar(s);
    verificar(await esperarSalud(s.puerto), `${s.nombre} responde en :${s.puerto}`);
  }
  const salud = await api('GET', '/salud');
  verificar(
    salud.status === 200 && Object.values(salud.json.data.servicios).every((e) => e === 'OK'),
    'Gateway ve los 3 microservicios OK',
    resumen(salud),
  );

  try {
    await flujo();
  } finally {
    seccion('Limpieza de datos de prueba');
    await limpiar(ventasPrevias);
    const huellaFinal = huellaInventario();
    verificar(huellaFinal === huellaInicial, 'Inventario, Kardex, productos, clientes y ventas idénticos al estado inicial', `${huellaInicial} ≠ ${huellaFinal}`);
    for (const s of [...SERVICIOS].reverse()) detener(s.nombre);
  }
}

async function flujo() {
  // --------------------------------------------------------------- autenticación
  seccion('Autenticación JWT en el gateway');
  const sinToken = await api('GET', '/variantes', { sinToken: true });
  verificar(sinToken.status === 401 && sinToken.json.error_code === 'NO_AUTENTICADO', 'Sin token → 401 NO_AUTENTICADO', resumen(sinToken));
  const malo = await api('POST', '/auth/login', { cuerpo: { usuario: USUARIO, contrasena: 'incorrecta' }, sinToken: true });
  verificar(malo.status === 401 && malo.json.error_code === 'CREDENCIALES_INVALIDAS', 'Contraseña incorrecta → 401', resumen(malo));
  const login = await api('POST', '/auth/login', { cuerpo: { usuario: USUARIO, contrasena: CLAVE }, sinToken: true });
  verificar(login.status === 200 && login.json.data?.access_token, 'Login correcto → 200 con access_token', resumen(login));
  token = login.json.data?.access_token ?? '';
  const ruta404 = await api('GET', '/inexistente');
  verificar(ruta404.status === 404, 'Ruta desconocida → 404', resumen(ruta404));

  // --------------------------------------------------------------- inventario
  seccion('Consulta de variantes y KPIs');
  const cid = randomUUID();
  const lista1 = await api('GET', '/variantes?marca_equipo=Argentina&temporada=2024&solo_disponibles=true', { cabeceras: { 'X-Correlation-Id': cid } });
  verificar(lista1.status === 200 && lista1.json.status === 200, 'GET /variantes con filtros → 200 y sobre {status,message,data}', resumen(lista1));
  verificar(lista1.headers.get('x-correlation-id') === cid, 'X-Correlation-Id se propaga de ida y vuelta');
  const kpis = lista1.json.data.kpis;
  verificar(kpis.total_skus === 3 && kpis.unidades_stock === 3 && kpis.valorizacion_costo_jrs === '90.00', `KPIs filtrados: ${kpis.total_skus} SKUs, ${kpis.unidades_stock} u., costo ${kpis.valorizacion_costo_jrs}`, JSON.stringify(kpis));
  const global = (await api('GET', '/variantes?limit=1')).json.data.kpis;
  verificar(global.total_skus === 95 && global.unidades_stock === 153 && global.skus_sin_costo === 80, `KPIs globales: ${global.total_skus} SKUs, ${global.unidades_stock} u., ${global.skus_sin_costo} sin costo`, JSON.stringify(global));
  const porCodigo = async (c) => (await api('GET', `/variantes?codigo_legacy=${c}`)).json.data.items[0];
  const A = await porCodigo('LTOO7'); // Argentina 2024 LOCAL M, stock 1, costo 30
  const B = await porCodigo('LTOO5'); // Argentina 2024 LOCAL XL, stock 1, costo 30
  const C = await porCodigo('ABC0001'); // Argentina 2026 DESPEDIDA M, stock 9
  verificar(A && B && C && A.stock_actual === 1 && B.stock_actual === 1 && C.stock_actual === 9, 'Variantes de prueba LTOO7, LTOO5 y ABC0001 localizadas');

  seccion('Alta de productos y variantes');
  const prodDup = await api('POST', '/productos', { cuerpo: { categoria: 'camiseta', nombre: 'Argentina LOCAL', marca_equipo: 'Argentina', temporada_coleccion: '2024' } });
  verificar(prodDup.status === 409 && prodDup.json.error_code === 'PRODUCTO_DUPLICADO', 'Producto existente → 409 PRODUCTO_DUPLICADO', resumen(prodDup));
  const prod = await api('POST', '/productos', { cuerpo: { categoria: 'gorra', nombre: 'Gorra E2E Prueba', marca_equipo: 'Jersey Club E2E', temporada_coleccion: '2026' } });
  verificar(prod.status === 201 && prod.json.data.categoria === 'GORRA' && prod.headers.get('location'), 'POST /productos → 201 + Location (categoría normalizada a GORRA)', resumen(prod));
  if (prod.json.data?.id) creado.productos.add(prod.json.data.id);
  const varDup = await api('POST', '/variantes', { cuerpo: { producto_id: A.producto_id, talla_medida: 'm', version_modelo: 'jugador', adicional_parche: 'campeón del mundo', adicional_dorsal: 'messi 10' } });
  verificar(varDup.status === 409 && varDup.json.error_code === 'VARIANTE_DUPLICADA', 'Variante exacta existente → 409 VARIANTE_DUPLICADA (índice único)', resumen(varDup));
  const varNueva = await api('POST', '/variantes', { cuerpo: { producto_id: prod.json.data.id, talla_medida: 'Única', version_modelo: 'fan' } });
  verificar(varNueva.status === 201 && varNueva.json.data.stock_actual === 0, 'POST /variantes → 201 con stock 0', resumen(varNueva));
  const V = varNueva.json.data;
  const sinClave = await api('POST', '/stock/ajustes', { cuerpo: { variante_id: V.id, tipo: 'AJUSTE_ENTRADA', cantidad: 5, observacion: 'Ingreso E2E' } });
  verificar(sinClave.status === 400 && sinClave.json.error_code === 'IDEMPOTENCY_KEY_REQUERIDA', 'Ajuste sin Idempotency-Key → 400', resumen(sinClave));
  const kEntrada = `e2e-aj-${randomUUID().slice(0, 8)}`;
  creado.clavesAjuste.push(kEntrada);
  const entrada = await api('POST', '/stock/ajustes', { cabeceras: { 'Idempotency-Key': kEntrada }, cuerpo: { variante_id: V.id, tipo: 'AJUSTE_ENTRADA', cantidad: 5, observacion: 'Ingreso de mercadería E2E' } });
  const entrada2 = await api('POST', '/stock/ajustes', { cabeceras: { 'Idempotency-Key': kEntrada }, cuerpo: { variante_id: V.id, tipo: 'AJUSTE_ENTRADA', cantidad: 5, observacion: 'Ingreso de mercadería E2E' } });
  verificar(entrada.status === 201 && entrada2.status === 200 && entrada2.headers.get('idempotent-replayed') === 'true' && stockDe(V.id) === 5, 'AJUSTE_ENTRADA +5 (201) y su repetición idempotente (200) dejan stock 5', `${resumen(entrada)} | ${resumen(entrada2)}`);
  const kSalida = `e2e-aj-${randomUUID().slice(0, 8)}`;
  creado.clavesAjuste.push(kSalida);
  const salidaMala = await api('POST', '/stock/ajustes', { cabeceras: { 'Idempotency-Key': kSalida }, cuerpo: { variante_id: V.id, tipo: 'AJUSTE_SALIDA', cantidad: 9, observacion: 'Salida E2E' } });
  verificar(salidaMala.status === 409 && salidaMala.json.error_code === 'STOCK_INSUFICIENTE' && stockDe(V.id) === 5, 'AJUSTE_SALIDA mayor al stock → 409 sin mover stock', resumen(salidaMala));
  const precios = await api('PATCH', `/variantes/${V.id}/precios`, { cuerpo: { valor_jersey_club: 8.5, pvp_sugerido: '15' } });
  verificar(precios.status === 200 && precios.json.data.valor_jersey_club === '8.50' && precios.json.data.pvp_sugerido === '15.00', 'PATCH /variantes/:id/precios → 8.50 / 15.00', resumen(precios));

  // --------------------------------------------------------------- clientes
  seccion('Clientes con identificación ecuatoriana');
  const cedMala = await api('POST', '/clientes', { cuerpo: { tipo_identificacion: 'CEDULA', identificacion: '1710034060', nombre_completo: 'Prueba' } });
  verificar(cedMala.status === 400 && cedMala.json.error_code === 'IDENTIFICACION_INVALIDA', 'Cédula con dígito verificador erróneo → 400 IDENTIFICACION_INVALIDA', resumen(cedMala));
  const rucMalo = await api('POST', '/clientes', { cuerpo: { tipo_identificacion: 'RUC', identificacion: '1710034065002', nombre_completo: 'Prueba' } });
  verificar(rucMalo.status === 400 && rucMalo.json.error_code === 'IDENTIFICACION_INVALIDA', 'RUC que no termina en 001 → 400', resumen(rucMalo));
  const cli = await api('POST', '/clientes', { cuerpo: { tipo_identificacion: 'CEDULA', identificacion: CEDULA_PRUEBA, nombre_completo: 'Cliente Prueba E2E', telefono: '099 000 0000', email: 'PRUEBA.E2E@EJEMPLO.COM', ciudad: 'Quito', courier_preferido: 'LAAR_COURIER' } });
  verificar(cli.status === 201 && cli.json.data.email === 'prueba.e2e@ejemplo.com' && cli.json.data.courier_preferido === 'LAAR_COURIER', 'Cédula válida → 201 (email normalizado, courier LAAR_COURIER)', resumen(cli));
  if (cli.json.data?.id) creado.clientes.add(cli.json.data.id);
  const cliente = cli.json.data;
  const cliDup = await api('POST', '/clientes', { cuerpo: { tipo_identificacion: 'CEDULA', identificacion: CEDULA_PRUEBA, nombre_completo: 'Otro' } });
  verificar(cliDup.status === 409 && cliDup.json.error_code === 'CLIENTE_DUPLICADO', 'Identificación repetida → 409 CLIENTE_DUPLICADO', resumen(cliDup));
  const porIdent = await api('GET', `/clientes/identificacion/${CEDULA_PRUEBA}`);
  const busq = await api('GET', '/clientes?busqueda=0990000000');
  verificar(porIdent.status === 200 && busq.json.data?.items.some((c) => c.id === cliente.id), 'GET /clientes/identificacion/:id y búsqueda por teléfono encuentran al cliente', `${resumen(porIdent)} | ${resumen(busq)}`);
  const patchCF = await api('PATCH', '/clientes/00000000-0000-4000-8000-000000000001', { cuerpo: { telefono: '0999999999' } });
  verificar(patchCF.status === 409 && patchCF.json.error_code === 'CONSUMIDOR_FINAL_INMUTABLE', 'El consumidor final no es editable → 409', resumen(patchCF));

  // --------------------------------------------------------------- ventas
  seccion('Venta en un clic (saga orquestada por ms-ventas)');
  const venta = (clave, cuerpo) => api('POST', '/ventas', { cabeceras: { 'Idempotency-Key': clave }, cuerpo });
  const clave1 = `e2e-venta-${randomUUID()}`;
  const cuerpo1 = { cliente_id: cliente.id, metodo_pago: 'TRANSFERENCIA', vendedor_id: null, items: [{ variante_id: A.id, cantidad: 1, precio_venta_unitario: '45.00' }] };
  const v1 = await venta(clave1, cuerpo1);
  if (v1.json.data?.id) creado.ventas.add(v1.json.data.id);
  verificar(v1.status === 201 && v1.json.data.estado === 'CONFIRMADA', `POST /ventas → 201 CONFIRMADA (${v1.json.data?.numero_comprobante})`, resumen(v1));
  verificar(stockDe(A.id) === 0, 'Stock de LTOO7 bajó de 1 a 0 en PostgreSQL');
  const d1 = v1.json.data?.detalle?.[0];
  verificar(v1.json.data?.total_vendido === '45.00' && v1.json.data?.costo_total_jrs === '30.00' && v1.json.data?.ganancia_total === '15.00' && d1?.valor_jersey_club_unitario === '30.00', 'Totales y costo congelado: 45.00 − 30.00 = 15.00', resumen(v1));
  verificar(v1.json.data?.cliente_snapshot?.identificacion === CEDULA_PRUEBA && d1?.snapshot_producto?.codigo_legacy === 'LTOO7', 'Snapshots JSONB de cliente y producto guardados');
  const kardex = sql(`SELECT tipo || ':' || cantidad || ':' || stock_anterior || '->' || stock_nuevo || ':' || costo_unitario FROM ms_inventario.movimientos_stock WHERE referencia_id = '${v1.json.data?.id}';`);
  verificar(kardex === 'VENTA:1:1->0:30.00', `Kardex registra ${kardex}`);
  const outbox = sql(`SELECT tipo_evento || ':' || procesado || ':' || (payload ? 'vendedor_id') FROM ms_ventas.outbox_eventos WHERE agregado_id = '${v1.json.data?.id}';`);
  verificar(outbox === 'VentaConfirmada:false:true', 'outbox_eventos tiene VentaConfirmada (con vendedor_id) sin procesar');

  const v1b = await venta(clave1, cuerpo1);
  verificar(v1b.status === 200 && v1b.headers.get('idempotent-replayed') === 'true' && v1b.json.data?.id === v1.json.data?.id && stockDe(A.id) === 0, 'Reintento con la misma Idempotency-Key → 200, misma venta, sin descontar de nuevo', resumen(v1b));

  const v2 = await venta(`e2e-venta-${randomUUID()}`, { ...cuerpo1, metodo_pago: 'EFECTIVO' });
  const idRechazada = sql(`SELECT id FROM ms_ventas.ventas WHERE estado = 'RECHAZADA' AND idempotency_key LIKE 'e2e-venta-%' ORDER BY created_at DESC LIMIT 1;`);
  if (idRechazada) creado.ventas.add(idRechazada);
  verificar(v2.status === 409 && v2.json.error_code === 'STOCK_INSUFICIENTE' && /disponible 0/.test(v2.json.details?.[0] ?? ''), 'Sin stock → 409 STOCK_INSUFICIENTE con la variante que falló', resumen(v2));
  verificar(!!idRechazada && stockDe(A.id) === 0, 'La venta quedó RECHAZADA y el stock no se movió');

  seccion('Concurrencia: dos ventas simultáneas por la última unidad (LTOO5)');
  const [c1, c2] = await Promise.all(
    ['TARJETA', 'EFECTIVO'].map((metodo) =>
      venta(`e2e-venta-${randomUUID()}`, { metodo_pago: metodo, items: [{ variante_id: B.id, cantidad: 1, precio_venta_unitario: '45.00' }] }),
    ),
  );
  for (const r of [c1, c2]) if (r.json.data?.id) creado.ventas.add(r.json.data.id);
  sql(`SELECT id FROM ms_ventas.ventas WHERE idempotency_key LIKE 'e2e-venta-%';`).split('\n').filter(Boolean).forEach((id) => creado.ventas.add(id));
  const estados = [c1.status, c2.status].sort().join(',');
  verificar(estados === '201,409' && stockDe(B.id) === 0, `Exactamente una gana (${estados}); stock final 0, nunca negativo`, `${resumen(c1)} | ${resumen(c2)}`);
  const ganadora = [c1, c2].find((r) => r.status === 201);
  verificar(ganadora?.json.data?.cliente_snapshot?.tipo_identificacion === 'CONSUMIDOR_FINAL', 'Venta sin cliente_id → consumidor final');

  seccion('Compensación: fallo después de descontar (desbordamiento al guardar el detalle)');
  const stockC = stockDe(C.id);
  const vf = await venta(`e2e-venta-${randomUUID()}`, { metodo_pago: 'EFECTIVO', items: [{ variante_id: C.id, cantidad: 2, precio_venta_unitario: '99999999.00' }] });
  const idFallida = sql(`SELECT id FROM ms_ventas.ventas WHERE estado = 'FALLIDA' AND idempotency_key LIKE 'e2e-venta-%' ORDER BY created_at DESC LIMIT 1;`);
  if (idFallida) creado.ventas.add(idFallida);
  verificar(vf.status === 500 && vf.json.error_code === 'VENTA_FALLIDA' && /revertido/.test(vf.json.details?.join(' ') ?? ''), '→ 500 VENTA_FALLIDA, informa que el stock fue revertido', resumen(vf));
  const kardexF = sql(`SELECT string_agg(tipo || ':' || cantidad, ',' ORDER BY created_at) FROM ms_inventario.movimientos_stock WHERE referencia_id = '${idFallida}';`);
  verificar(!!idFallida && stockDe(C.id) === stockC && kardexF === 'VENTA:2,REVERSION_VENTA:2', `Venta FALLIDA, stock de ABC0001 intacto (${stockC}), Kardex ${kardexF}`);

  seccion('Dashboard y consultas');
  const dash = await api('GET', '/ventas/dashboard');
  const dd = dash.json.data ?? {};
  const top = dd.top_productos?.[0];
  verificar(dash.status === 200 && dd.ventas_confirmadas === 2 && dd.total_vendido === '90.00' && dd.costo_total_jrs === '60.00' && dd.ganancia_neta === '30.00' && dd.ticket_promedio === '45.00', `Dashboard: ${dd.ventas_confirmadas} ventas, ${dd.total_vendido} vendido, ${dd.costo_total_jrs} costo, ganancia ${dd.ganancia_neta}, margen ${dd.margen_porcentaje}%`, resumen(dash));
  verificar(top?.nombre === 'Argentina LOCAL' && top?.unidades === 2 && dd.por_metodo_pago?.length === 3, `Top producto: ${top?.nombre} (${top?.unidades} u.); desglose por 3 métodos de pago`, JSON.stringify(dd.por_metodo_pago));
  const hist = await api('GET', '/ventas?metodo_pago=TRANSFERENCIA&estado=CONFIRMADA');
  verificar(hist.status === 200 && hist.json.data.items.some((v) => v.id === v1.json.data?.id), 'GET /ventas filtra por método de pago y estado', resumen(hist));
  const detalle = await api('GET', `/ventas/${v1.json.data?.id}`);
  verificar(detalle.status === 200 && detalle.json.data.detalle.length === 1, 'GET /ventas/:id devuelve el detalle');

  seccion('Degradación: ms-clientes caído no bloquea la venta');
  detener('ms-clientes');
  await new Promise((r) => setTimeout(r, 500));
  const stockAntesDeg = stockDe(C.id);
  const vd = await venta(`e2e-venta-${randomUUID()}`, {
    cliente_id: cliente.id,
    cliente_respaldo: { tipo_identificacion: 'CEDULA', identificacion: CEDULA_PRUEBA, nombre_completo: 'CLIENTE PRUEBA E2E' },
    metodo_pago: 'TARJETA',
    items: [{ variante_id: C.id, cantidad: 1, precio_venta_unitario: '40.00' }],
  });
  if (vd.json.data?.id) creado.ventas.add(vd.json.data.id);
  verificar(vd.status === 201 && /Atención/.test(vd.json.message) && vd.json.data?.cliente_snapshot?.origen === 'RESPALDO_PAYLOAD', 'Venta confirmada con el cliente de respaldo y advertencia', resumen(vd));
  verificar(stockDe(C.id) === stockAntesDeg - 1, 'El stock sí se descontó (inventario es obligatorio, clientes no)');
  const cliCaido = await api('GET', `/clientes/${cliente.id}`);
  verificar(cliCaido.status === 503 && cliCaido.json.error_code === 'SERVICIO_NO_DISPONIBLE', 'El gateway responde 503 uniforme para ms-clientes caído', resumen(cliCaido));

  seccion('Reversión manual de las ventas confirmadas de prueba');
  const confirmadas = sql(`SELECT id FROM ms_ventas.ventas WHERE estado = 'CONFIRMADA' AND id IN (${lista([...creado.ventas])});`).split('\n').filter(Boolean);
  for (const id of confirmadas) {
    const r = await api('POST', '/stock/reversiones', { cabeceras: { 'Idempotency-Key': `e2e-rev-${id}` }, cuerpo: { referencia_id: id, motivo: 'Limpieza prueba E2E' } });
    verificar(r.status === 201, `Reversión de la venta ${id.slice(0, 8)} → 201`, resumen(r));
  }
  if (confirmadas[0]) {
    const rr = await api('POST', '/stock/reversiones', { cabeceras: { 'Idempotency-Key': `e2e-rev-x-${confirmadas[0].slice(0, 8)}` }, cuerpo: { referencia_id: confirmadas[0] } });
    verificar(rr.status === 200 && rr.headers.get('idempotent-replayed') === 'true', 'Reversión repetida (otra clave) → 200 sin mover stock', resumen(rr));
  }
  verificar(stockDe(A.id) === 1 && stockDe(B.id) === 1 && stockDe(C.id) === 9, 'Stock de LTOO7, LTOO5 y ABC0001 restaurado (1, 1, 9)');
}

async function limpiar(ventasPrevias) {
  const ventas = lista([...creado.ventas]);
  const productos = lista([...creado.productos]);
  const clientes = lista([...creado.clientes]);
  const claves = creado.clavesAjuste.map((c) => `'${c}'`).join(',') || "''";
  sql(`BEGIN;
    DELETE FROM ms_ventas.outbox_eventos WHERE agregado_id IN (${ventas});
    DELETE FROM ms_ventas.detalle_ventas WHERE venta_id IN (${ventas});
    DELETE FROM ms_ventas.ventas WHERE id IN (${ventas});
    DELETE FROM ms_inventario.movimientos_stock WHERE referencia_id IN (${ventas}) OR idempotency_key IN (${claves})
      OR variante_id IN (SELECT id FROM ms_inventario.variantes WHERE producto_id IN (${productos}));
    DELETE FROM ms_inventario.variantes WHERE producto_id IN (${productos});
    DELETE FROM ms_inventario.productos WHERE id IN (${productos});
    DELETE FROM ms_clientes.clientes WHERE id IN (${clientes});
    COMMIT;`);
  if (ventasPrevias === 0) sql('ALTER SEQUENCE ms_ventas.seq_numero_comprobante RESTART WITH 1;');
  console.log(`  ventas: ${creado.ventas.size}, productos: ${creado.productos.size}, clientes: ${creado.clientes.size} eliminados`);
}

main()
  .catch((e) => {
    verificar(false, 'Error inesperado', e.stack ?? String(e));
  })
  .finally(() => {
    for (const nombre of [...procesos.keys()]) detener(nombre);
    const fallos = resultados.filter((r) => !r.ok).length;
    console.log(`\n${resultados.length - fallos}/${resultados.length} verificaciones OK${fallos ? ` — ${fallos} FALLARON` : ''}`);
    process.exitCode = fallos ? 1 : 0;
  });
