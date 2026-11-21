"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Isotipo } from "@/components/marca";
import { obtenerSesion } from "@/lib/sesion";

/** Entrada: al panel si hay sesión, si no al login. */
export default function Inicio() {
  const router = useRouter();
  useEffect(() => {
    router.replace(obtenerSesion() ? "/dashboard/" : "/login/");
  }, [router]);
  return (
    <div className="grid min-h-dvh place-items-center bg-tinta">
      <Isotipo className="size-12 animate-pulse" />
    </div>
  );
}
