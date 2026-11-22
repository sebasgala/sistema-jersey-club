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
import { cerrarSesion, ETIQUETA_ROL, iniciales, useSesion } from "@/lib/sesion";
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

function Avatar({ nombre, className }: { nombre: string; className?: string }) {
  return (
    <span aria-hidden className={cx("grid shrink-0 place-items-center rounded-full bg-tinta-3 text-[0.85rem] font-extrabold text-blanco ring-1 ring-plata-3/50", className ?? "size-9")}>
      {iniciales(nombre)}
    </span>
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
              "flex h-12 items-center justify-center gap-2 rounded-[var(--radius-placa)] bg-blanco font-bold text-tinta transition-colors hover:bg-plata-1",
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
          <div className="flex items-center gap-3">
            <Avatar nombre={sesion.nombre} className="size-10" />
            <div className="min-w-0">
              <p className="truncate font-semibold" title={sesion.email}>{sesion.nombre}</p>
              <p className="text-[0.8rem] text-humo">{ETIQUETA_ROL[sesion.role]}</p>
            </div>
          </div>
          <button type="button" onClick={salir} className="flex h-10 items-center gap-2 rounded-[var(--radius-placa)] px-3 text-[0.88rem] font-medium text-humo transition-colors hover:bg-tinta-2 hover:text-blanco">
            <LogOut className="size-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Cabecera (celular) */}
      <header className="sobre-tinta sticky top-0 z-30 flex h-14 items-center justify-between bg-tinta px-4 pt-[env(safe-area-inset-top)] text-blanco lg:hidden">
        <Link href="/dashboard/" aria-label="Ir al panel">
          <Marca />
        </Link>
        <span className="flex max-w-[11rem] items-center gap-2 rounded-full bg-tinta-2 py-1 pr-3 pl-1 text-[0.8rem] font-semibold text-plata-2">
          <Avatar nombre={sesion.nombre} className="size-7 text-[0.7rem]" />
          <span className="truncate">{sesion.nombre.split(" ")[0]}</span>
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
              "-mt-5 grid size-14 place-items-center rounded-full bg-blanco text-tinta shadow-[var(--shadow-flota)] ring-4 ring-tinta transition-colors",
              vendiendo && "bg-plata-1",
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

      <Hoja abierta={cuenta} alCerrar={() => setCuenta(false)} titulo="Cuenta" descripcion={ETIQUETA_ROL[sesion.role]}>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3 rounded-[var(--radius-placa)] border border-linea bg-blanco p-3.5">
            <Avatar nombre={sesion.nombre} className="size-12 text-[1rem]" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{sesion.nombre}</p>
              <p className="truncate text-[0.85rem] text-gris">{sesion.email}</p>
              <p className="truncate text-[0.8rem] text-gris">Usuario: {sesion.username}</p>
            </div>
          </div>
          {sesion.role === "VENDEDOR" && (
            <p className="text-[0.85rem] text-gris">
              Con el rol Vendedor puedes registrar ventas y consultar stock y clientes. Los costos, márgenes, precios y ajustes de inventario los gestiona un administrador.
            </p>
          )}
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
