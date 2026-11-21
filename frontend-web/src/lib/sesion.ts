"use client";

import { useSyncExternalStore } from "react";

/**
 * Sesión en localStorage. El perfil (Dueño / Vendedor) ajusta la interfaz:
 * es una vista, no un control de acceso — el gateway tiene hoy un solo usuario.
 */
export type Perfil = "DUENO" | "VENDEDOR";

export interface Sesion {
  token: string;
  expiraEn: number; // epoch ms
  usuario: string;
  perfil: Perfil;
}

const CLAVE = "jc.sesion";
const oyentes = new Set<() => void>();
let cache: Sesion | null | undefined;

function leer(): Sesion | null {
  if (cache !== undefined) return cache;
  try {
    const crudo = localStorage.getItem(CLAVE);
    const s = crudo ? (JSON.parse(crudo) as Sesion) : null;
    cache = s && s.expiraEn > Date.now() ? s : null;
  } catch {
    cache = null;
  }
  return cache;
}

function emitir() {
  oyentes.forEach((o) => o());
}

export function obtenerSesion(): Sesion | null {
  if (typeof window === "undefined") return null;
  const s = leer();
  if (s && s.expiraEn <= Date.now()) {
    cerrarSesion();
    return null;
  }
  return s;
}

export function guardarSesion(s: Sesion): void {
  cache = s;
  try {
    localStorage.setItem(CLAVE, JSON.stringify(s));
  } catch {
    /* modo privado: la sesión vive solo en memoria */
  }
  emitir();
}

export function cambiarPerfil(perfil: Perfil): void {
  const s = obtenerSesion();
  if (s) guardarSesion({ ...s, perfil });
}

export function cerrarSesion(): void {
  cache = null;
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
  emitir();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  const alCambiar = (e: StorageEvent) => {
    if (e.key === CLAVE) {
      cache = undefined;
      o();
    }
  };
  window.addEventListener("storage", alCambiar);
  return () => {
    oyentes.delete(o);
    window.removeEventListener("storage", alCambiar);
  };
}

export function useSesion(): Sesion | null {
  return useSyncExternalStore(suscribir, obtenerSesion, () => null);
}

export function useEsDueno(): boolean {
  return useSesion()?.perfil === "DUENO";
}
