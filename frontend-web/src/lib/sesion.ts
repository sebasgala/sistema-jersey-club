"use client";

import { useSyncExternalStore } from "react";

/**
 * Sesión en localStorage. El rol y los datos del usuario vienen del gateway al iniciar sesión
 * (usuarios reales de ms_auth). La interfaz oculta lo que el rol no puede usar, pero la
 * restricción real la aplica el gateway: un VENDEDOR no recibe costos ni puede administrar.
 */
export type Rol = "ADMIN" | "VENDEDOR";

export interface Sesion {
  token: string;
  expiraEn: number; // epoch ms
  id: string;
  username: string;
  email: string;
  nombre: string;
  role: Rol;
}

const CLAVE = "jc.sesion";
const oyentes = new Set<() => void>();
let cache: Sesion | null | undefined;

function esSesion(x: unknown): x is Sesion {
  const s = x as Partial<Sesion> | null;
  return (
    !!s &&
    typeof s.token === "string" &&
    typeof s.expiraEn === "number" &&
    typeof s.nombre === "string" &&
    typeof s.username === "string" &&
    (s.role === "ADMIN" || s.role === "VENDEDOR")
  );
}

function leer(): Sesion | null {
  if (cache !== undefined) return cache;
  try {
    const crudo = localStorage.getItem(CLAVE);
    const s: unknown = crudo ? JSON.parse(crudo) : null;
    // Una sesión guardada por la versión anterior (sin rol real) se descarta.
    cache = esSesion(s) && s.expiraEn > Date.now() ? s : null;
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

/** "Dueño" en la interfaz = rol ADMIN: ve costos, márgenes y administra inventario y precios. */
export function useEsDueno(): boolean {
  return useSesion()?.role === "ADMIN";
}

export const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: "Administrador",
  VENDEDOR: "Vendedor",
};

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "")).toUpperCase();
}
