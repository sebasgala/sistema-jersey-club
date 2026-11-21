import type { TipoIdentificacion } from "./tipos";

/** Validación ecuatoriana en el navegador (la misma regla que ms-clientes). Devuelve el error o null. */
function provinciaValida(dos: string): boolean {
  const p = Number(dos);
  return (p >= 1 && p <= 24) || p === 30;
}

export function validarCedula(c: string): string | null {
  if (!/^\d{10}$/.test(c)) return "La cédula tiene 10 dígitos.";
  if (!provinciaValida(c.slice(0, 2))) return "Los dos primeros dígitos no corresponden a una provincia.";
  if (Number(c[2]) >= 6) return "El tercer dígito de una cédula va de 0 a 5.";
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let p = Number(c[i]) * (i % 2 === 0 ? 2 : 1);
    if (p > 9) p -= 9;
    suma += p;
  }
  return (10 - (suma % 10)) % 10 === Number(c[9]) ? null : "El dígito verificador no coincide. Revisa el número.";
}

export function validarIdentificacion(tipo: TipoIdentificacion, valor: string): string | null {
  const v = valor.replace(/[\s-]/g, "");
  switch (tipo) {
    case "CEDULA":
      return validarCedula(v);
    case "RUC": {
      if (!/^\d{13}$/.test(v)) return "El RUC tiene 13 dígitos.";
      if (!v.endsWith("001")) return "El RUC termina en 001.";
      if (!provinciaValida(v.slice(0, 2))) return "Los dos primeros dígitos no corresponden a una provincia.";
      const t = Number(v[2]);
      if (t <= 5) return validarCedula(v.slice(0, 10)) ? "Los 10 primeros dígitos no forman una cédula válida." : null;
      return t === 6 || t === 9 ? null : "El tercer dígito del RUC no es válido.";
    }
    case "PASAPORTE":
      return /^[A-Za-z0-9]{5,20}$/.test(v) ? null : "El pasaporte lleva de 5 a 20 letras o números.";
    case "CONSUMIDOR_FINAL":
      return null;
  }
}

export const ETIQUETA_TIPO: Record<TipoIdentificacion, string> = {
  CEDULA: "Cédula",
  RUC: "RUC",
  PASAPORTE: "Pasaporte",
  CONSUMIDOR_FINAL: "Consumidor final",
};
