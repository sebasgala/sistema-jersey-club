// Next 16.4 (output: "export") escribe los segmentos de prefetch en carpetas
// (`__next.!X/ruta/__PAGE__.txt`), pero el router del navegador los pide como archivo
// plano (`__next.!X.ruta.__PAGE__.txt`, ver convertSegmentPathToStaticExportFilename).
// Este paso posterior al build crea la copia plana para que el prefetch no devuelva 404
// en hosts estáticos (Azure Static Web Apps). No modifica ni borra lo generado por Next.
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../out/", import.meta.url));
let copiados = 0;

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? archivos(p) : [p];
  });
}

function recorrer(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (!statSync(ruta).isDirectory()) continue;
    if (nombre.startsWith("__next.")) {
      for (const f of archivos(ruta)) {
        const plano = join(dir, `${nombre}.${relative(ruta, f).split(sep).join(".")}`);
        if (!existsSync(plano)) {
          copyFileSync(f, plano);
          copiados++;
        }
      }
    } else {
      recorrer(ruta);
    }
  }
}

if (existsSync(OUT)) recorrer(OUT);
console.log(`aplanar-segmentos: ${copiados} archivos de prefetch copiados`);
