"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";

interface Estado<T> {
  clave: string;
  datos?: T;
  error?: unknown;
}

/**
 * Carga datos por clave. Mientras recarga conserva los datos anteriores (sin parpadeo),
 * cancela la petición anterior y expone recargar() y actualizar() para cambios locales.
 */
export function useConsulta<T>(clave: string | null, cargar: (signal: AbortSignal) => Promise<T>) {
  const [estado, setEstado] = useState<Estado<T> | null>(null);
  const [version, setVersion] = useState(0);
  const claveActual = clave === null ? null : `${clave}#${version}`;
  const ejecutar = useEffectEvent((signal: AbortSignal) => cargar(signal));

  useEffect(() => {
    if (claveActual === null) return;
    const ctrl = new AbortController();
    ejecutar(ctrl.signal).then(
      (datos) => setEstado({ clave: claveActual, datos }),
      (error: unknown) => {
        if (!ctrl.signal.aborted) setEstado((prev) => ({ clave: claveActual, datos: prev?.datos, error }));
      },
    );
    return () => ctrl.abort();
  }, [claveActual]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const actualizar = useCallback(
    (fn: (d: T) => T) => setEstado((prev) => (prev?.datos === undefined ? prev : { ...prev, datos: fn(prev.datos) })),
    [],
  );

  const listo = estado?.clave === claveActual;
  return {
    datos: estado?.datos,
    error: listo ? estado?.error : undefined,
    cargando: !listo,
    recargar,
    actualizar,
  };
}
