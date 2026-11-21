"use client";

import { useEffect, useState } from "react";

/** Devuelve el valor tras `ms` sin cambios (búsquedas al escribir). */
export function useRetrasado<T>(valor: T, ms = 300): T {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}
