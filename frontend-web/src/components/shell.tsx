"use client";

import {
  Boxes,
  LayoutGrid,
  LogOut,
  Plus,
  ReceiptText,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { cambiarPerfil, cerrarSesion, useSesion, type Perfil } from "@/lib/sesion";
import { Isotipo, Marca } from "./marca";
import { Boton, cx, Hoja } from "./ui";

const NAV: { href: string; etiqueta: string; icono: LucideIcon }[] = [
  { href: "/dashboard/", etiqueta: "Panel", icono: LayoutGrid },
  { href: "/inventario/", etiqueta: "Inventario", icono: Boxes },
  { href: "/ventas/", etiqueta: "Ventas", icono: ReceiptText },
];

const sinSuscripcion = () => () => {};
function useHidratado(): boolean {
  return useSyncExternalStore(sinSuscripcion, () => true, () => false);
}

function activo(ruta: string, href: string): boolean {
  if (href === "/ventas/") return ruta === "/ventas/" || ruta === "/ventas";
  return ruta.startsWith(href.replace(/\/$/, ""));
}

export function SelectorPerfil({ perfil, oscuro = false }: { perfil: Perfil; oscuro?: boolean }) {
  return (
    <div
      role="radiogroup"
      aria-label="Vista"
      className={cx("grid grid-cols-2 rounded-full p-1 text-[0.82rem] font-semibold", oscuro ? "bg-tinta-2" : "bg-linea-2")}
    >
      {(["DUENO", "VENDEDOR"] as const).map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={perfil === p}
          onClick={() => cambiarPerfil(p)}
          className={cx(
            "h-8 rounded-full px-3 transition-colors",
            perfil === p ? "metal" : oscuro ? "text-humo hover:text-blanco" : "text-gris hover:text-tinta",
          )}
        >
          {p === "DUENO" ? "Dueño" : "Vendedor"}
        </button>
      ))}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const hidratado = useHidratado();
  const ruta = usePathname();
  const router = useRouter();
  const [cuenta, setCuenta] = useState(false);

  useEffect(() => {
    if (hidratado && !sesion) router.replace("/login/");
  }, [hidratado, sesion, router]);

  if (!hidratado || !sesion) {
    return (
      <div className="grid min-h-dvh place-items-center bg-tinta">
        <Isotipo className="size-12 animate-pulse" />
      </div>
    );
  }

  const salir = () => {
    cerrarSesion();
    router.replace("/login/");
  };
  const vendiendo = ruta.startsWith("/ventas/nueva");

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Riel lateral (PC) */}
      <aside className="sobre-tinta fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-tinta text-blanco lg:flex">
        <div className="px-6 pt-6 pb-8">
          <Link href="/dashboard/" aria-label="Ir al panel">
            <Marca />
          </Link>
        </div>
        <div className="px-4">
          <Link
            href="/ventas/nueva/"
            className={cx(
              "metal flex h-12 items-center justify-center gap-2 rounded-[var(--radius-placa)] font-bold transition-[filter] hover:brightness-105",
              vendiendo && "ring-2 ring-plata-2 ring-offset-2 ring-offset-tinta",
            )}
          >
            <Plus className="size-5" /> Registrar venta
          </Link>
        </div>
        <nav className="mt-6 flex flex-col gap-1 px-3" aria-label="Principal">
          {NAV.map(({ href, etiqueta, icono: Icono }) => {
            const a = activo(ruta, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={a ? "page" : undefined}
                className={cx(
                  "relative flex h-11 items-center gap-3 rounded-[var(--radius-placa)] px-3 font-medium transition-colors",
                  a ? "bg-tinta-2 text-blanco" : "text-humo hover:bg-tinta-2/60 hover:text-blanco",
                )}
              >
                {a && <span className="metal-barra absolute inset-y-2 left-0 w-[3px] rounded-full" />}
                <Icono className="size-[1.15rem]" />
                {etiqueta}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t border-tinta-3 px-4 py-5">
          <SelectorPerfil perfil={sesion.perfil} oscuro />
          <div className="flex items-center justify-between gap-2 text-[0.85rem]">
            <span className="truncate text-humo">
              Sesión: <b className="text-blanco">{sesion.usuario}</b>
            </span>
            <button type="button" onClick={salir} className="flex items-center gap-1.5 rounded px-2 py-1.5 text-humo hover:text-blanco">
              <LogOut className="size-4" /> Salir
            </button>
          </div>
        </div>
      </aside>

      {/* Cabecera (celular) */}
      <header className="sobre-tinta sticky top-0 z-30 flex h-14 items-center justify-between bg-tinta px-4 pt-[env(safe-area-inset-top)] text-blanco lg:hidden">
        <Link href="/dashboard/" aria-label="Ir al panel">
          <Marca />
        </Link>
        <span className="rounded-full bg-tinta-2 px-3 py-1 text-[0.78rem] font-semibold text-plata-2">
          {sesion.perfil === "DUENO" ? "Dueño" : "Vendedor"}
        </span>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
        {children}
      </main>

      {/* Barra inferior (celular) */}
      <nav
        aria-label="Principal"
        className="sobre-tinta fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end bg-tinta px-1 pb-[env(safe-area-inset-bottom)] text-humo lg:hidden"
      >
        {[NAV[0], NAV[1]].map((n) => (
          <ItemInferior key={n.href} {...n} activo={activo(ruta, n.href)} />
        ))}
        <Link href="/ventas/nueva/" className="flex flex-col items-center pb-2" aria-label="Registrar venta">
          <span
            className={cx(
              "metal -mt-5 grid size-14 place-items-center rounded-full shadow-[var(--shadow-flota)] ring-4 ring-tinta",
              vendiendo && "brightness-105",
            )}
          >
            <Plus className="size-7" />
          </span>
          <span className={cx("mt-1 text-[0.7rem] font-semibold", vendiendo ? "text-blanco" : "")}>Vender</span>
        </Link>
        <ItemInferior {...NAV[2]} activo={activo(ruta, NAV[2].href)} />
        <button type="button" onClick={() => setCuenta(true)} className="flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold">
          <UserRound className="size-5" />
          Cuenta
        </button>
      </nav>

      <Hoja abierta={cuenta} alCerrar={() => setCuenta(false)} titulo="Cuenta" descripcion={`Sesión iniciada como ${sesion.usuario}`}>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-[0.82rem] font-semibold">Vista</p>
            <SelectorPerfil perfil={sesion.perfil} />
            <p className="text-[0.82rem] text-gris">
              La vista Vendedor oculta costos, márgenes y la edición de precios e inventario.
            </p>
          </div>
          <Boton variante="secundario" icono={LogOut} onClick={salir}>
            Cerrar sesión
          </Boton>
        </div>
      </Hoja>
    </div>
  );
}

function ItemInferior({ href, etiqueta, icono: Icono, activo: a }: { href: string; etiqueta: string; icono: LucideIcon; activo: boolean }) {
  return (
    <Link
      href={href}
      aria-current={a ? "page" : undefined}
      className={cx("relative flex h-16 flex-col items-center justify-center gap-1 text-[0.7rem] font-semibold", a && "text-blanco")}
    >
      {a && <span className="metal-barra absolute top-0 h-[3px] w-8 rounded-full" />}
      <Icono className="size-5" />
      {etiqueta}
    </Link>
  );
}
