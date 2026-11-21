import type { Variante } from "./tipos";

/** Dinero en centavos enteros: nunca se calcula con punto flotante. */
export function aCentavos(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const texto = typeof valor === "number" ? valor.toFixed(2) : valor.trim().replace(",", ".");
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(texto);
  if (!m) return NaN;
  const c = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] === "-" ? -c : c;
}

export function deCentavos(c: number): string {
  const signo = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  return `${signo}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const usd = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const entero = new Intl.NumberFormat("es-EC");

export function dinero(valor: string | number | null | undefined): string {
  const c = typeof valor === "number" && !Number.isInteger(valor) ? Math.round(valor * 100) : aCentavos(valor ?? 0);
  return usd.format((Number.isNaN(c) ? 0 : c) / 100);
}

export function dineroCentavos(c: number): string {
  return usd.format(c / 100);
}

export function numero(n: number): string {
  return entero.format(n);
}

/** Margen sobre el precio de venta, en % con 1 decimal; null si no hay precio. */
export function margen(costoCentavos: number, precioCentavos: number): number | null {
  if (!precioCentavos) return null;
  return Math.round(((precioCentavos - costoCentavos) / precioCentavos) * 1000) / 10;
}

export function porcentaje(v: number | string | null): string {
  if (v === null || v === "") return "—";
  return `${Number(v).toLocaleString("es-EC", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

const fechaHora = new Intl.DateTimeFormat("es-EC", {
  timeZone: "America/Guayaquil",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const fechaLarga = new Intl.DateTimeFormat("es-EC", { timeZone: "America/Guayaquil", day: "numeric", month: "long" });

export function fecha(iso: string): string {
  return fechaHora.format(new Date(iso));
}

export function fechaDia(isoDia: string): string {
  return fechaLarga.format(new Date(`${isoDia}T12:00:00-05:00`));
}

/** Fecha local de Ecuador en AAAA-MM-DD. */
export function hoyEcuador(desplazamientoDias = 0): string {
  const d = new Date(Date.now() + desplazamientoDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(d);
}

export function inicioMesEcuador(): string {
  return `${hoyEcuador().slice(0, 8)}01`;
}

/** "Argentina LOCAL · 2024" */
export function nombreProducto(v: Pick<Variante, "producto">): string {
  const p = v.producto;
  if (!p) return "Producto";
  return [p.nombre, p.temporada_coleccion].filter(Boolean).join(" · ");
}

/** Variante exacta: Talla · Versión · Parche · Dorsal */
export function rasgos(v: {
  talla_medida: string;
  version_modelo: string;
  adicional_parche: string | null;
  adicional_dorsal: string | null;
}): string[] {
  return [
    `Talla ${v.talla_medida}`,
    titulo(v.version_modelo),
    v.adicional_parche ? `Parche ${titulo(v.adicional_parche)}` : "Sin parche",
    v.adicional_dorsal ? `Dorsal ${v.adicional_dorsal}` : "Sin dorsal",
  ];
}

export function titulo(texto: string): string {
  return texto
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/(^|[\s(])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
}

export function uuid(): string {
  return crypto.randomUUID();
}
