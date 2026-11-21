"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ Botón
type VarianteBoton = "primario" | "secundario" | "fantasma" | "metal" | "peligro";

const ESTILO_BOTON: Record<VarianteBoton, string> = {
  primario: "bg-tinta text-blanco hover:bg-tinta-2 active:bg-tinta-3 disabled:bg-tinta/40",
  secundario: "bg-blanco text-tinta border border-linea hover:border-tinta/40 hover:bg-plata-1 disabled:text-gris",
  fantasma: "text-tinta hover:bg-tinta/6 disabled:text-gris",
  metal: "metal hover:brightness-[1.04] disabled:opacity-50",
  peligro: "bg-error text-blanco hover:brightness-110 disabled:opacity-50",
};

export function Boton({
  variante = "primario",
  tamano = "md",
  cargando = false,
  icono: Icono,
  className,
  children,
  disabled,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBoton;
  tamano?: "sm" | "md" | "lg";
  cargando?: boolean;
  icono?: LucideIcon;
}) {
  return (
    <button
      type="button"
      {...resto}
      disabled={disabled || cargando}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 rounded-[var(--radius-placa)] font-semibold transition-[background-color,border-color,filter,transform] duration-150 active:scale-[0.985] disabled:cursor-not-allowed disabled:active:scale-100",
        tamano === "sm" && "h-9 px-3 text-sm",
        tamano === "md" && "h-11 px-4 text-[0.95rem]",
        tamano === "lg" && "h-14 px-5 text-base",
        ESTILO_BOTON[variante],
        className,
      )}
    >
      {cargando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icono ? <Icono className="size-[1.1em]" aria-hidden /> : null}
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Campos
const BASE_CAMPO =
  "w-full rounded-[var(--radius-placa)] border bg-blanco px-3 text-[0.95rem] text-tinta placeholder:text-gris/80 transition-colors focus:outline-none focus-visible:outline-none focus:border-tinta focus:ring-2 focus:ring-tinta/12 disabled:bg-plata-1 disabled:text-gris";

export function Campo({
  etiqueta,
  ayuda,
  error,
  className,
  claseInput,
  sufijo,
  ...resto
}: InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  claseInput?: string;
  sufijo?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[0.82rem] font-semibold text-tinta">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          {...resto}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || ayuda ? `${id}-nota` : undefined}
          className={cx(BASE_CAMPO, "h-11", error ? "border-error" : "border-linea", sufijo ? "pr-12" : "", claseInput)}
        />
        {sufijo && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gris">{sufijo}</span>}
      </div>
      {(error || ayuda) && (
        <p id={`${id}-nota`} className={cx("text-[0.8rem]", error ? "font-medium text-error" : "text-gris")}>
          {error || ayuda}
        </p>
      )}
    </div>
  );
}

export function Selector({
  etiqueta,
  opciones,
  vacio,
  className,
  error,
  ...resto
}: SelectHTMLAttributes<HTMLSelectElement> & {
  etiqueta: string;
  opciones: readonly { valor: string; etiqueta: string }[];
  vacio?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[0.82rem] font-semibold text-tinta">
        {etiqueta}
      </label>
      <select
        id={id}
        {...resto}
        className={cx(BASE_CAMPO, "h-11 appearance-none bg-[length:16px] bg-[right_0.7rem_center] bg-no-repeat pr-9", error ? "border-error" : "border-linea")}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231b1c1e' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        }}
      >
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
      {error && <p className="text-[0.8rem] font-medium text-error">{error}</p>}
    </div>
  );
}

export function Interruptor({
  activo,
  alCambiar,
  etiqueta,
}: {
  activo: boolean;
  alCambiar: (v: boolean) => void;
  etiqueta: string;
}) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer select-none items-center gap-3 text-[0.9rem] font-medium">
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        onClick={() => alCambiar(!activo)}
        className={cx(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
          activo ? "bg-tinta" : "bg-plata-2",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 left-0.5 size-5 rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.3)] transition-transform duration-200",
            activo ? "metal translate-x-5" : "bg-blanco",
          )}
        />
      </button>
      {etiqueta}
    </label>
  );
}

// ------------------------------------------------------------------ Estados de stock
export function EstadoStock({ stock, compacto = false }: { stock: number; compacto?: boolean }) {
  const tono =
    stock <= 0
      ? "bg-error-fondo text-error"
      : stock === 1
        ? "bg-alerta-fondo text-alerta"
        : "bg-ok-fondo text-ok";
  const texto = stock <= 0 ? "Agotado" : stock === 1 ? "Última unidad" : `${stock} en stock`;
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.78rem] font-semibold whitespace-nowrap", tono)}
      title={`${stock} unidades`}
    >
      <span className="cifra text-[0.95rem] leading-none font-bold">{stock}</span>
      {!compacto && <span>{stock <= 0 ? "agotado" : stock === 1 ? "última" : "en stock"}</span>}
      <span className="sr-only">{texto}</span>
    </span>
  );
}

// ------------------------------------------------------------------ Avisos
const AVISO: Record<"info" | "alerta" | "error" | "ok", { clase: string; icono: LucideIcon }> = {
  info: { clase: "bg-blanco border-linea text-tinta", icono: Info },
  alerta: { clase: "bg-alerta-fondo border-alerta/25 text-alerta", icono: AlertTriangle },
  error: { clase: "bg-error-fondo border-error/25 text-error", icono: XCircle },
  ok: { clase: "bg-ok-fondo border-ok/25 text-ok", icono: CheckCircle2 },
};

export function Aviso({
  tono = "info",
  titulo,
  children,
  accion,
  className,
}: {
  tono?: keyof typeof AVISO;
  titulo: string;
  children?: ReactNode;
  accion?: ReactNode;
  className?: string;
}) {
  const { clase, icono: Icono } = AVISO[tono];
  return (
    <div role={tono === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-[var(--radius-placa)] border p-3.5", clase, className)}>
      <Icono className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{titulo}</p>
        {children && <div className="mt-0.5 text-[0.88rem] opacity-90">{children}</div>}
        {accion && <div className="mt-2.5">{accion}</div>}
      </div>
    </div>
  );
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-[var(--radius-placa)] bg-linea/70", className)} aria-hidden />;
}

export function Vacio({ icono: Icono, titulo, children }: { icono: LucideIcon; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <Icono className="size-8 text-plata-3" aria-hidden />
      <p className="font-semibold">{titulo}</p>
      {children && <div className="max-w-sm text-[0.9rem] text-gris">{children}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Hoja (panel lateral en PC, hoja inferior en celular)
export function Hoja({
  abierta,
  alCerrar,
  titulo,
  descripcion,
  children,
  pie,
}: {
  abierta: boolean;
  alCerrar: () => void;
  titulo: string;
  descripcion?: string;
  children: ReactNode;
  pie?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);
  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      onClick={(e) => {
        if (e.target === ref.current) alCerrar();
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl bg-papel p-0 text-tinta shadow-[var(--shadow-flota)] backdrop:bg-tinta/45 backdrop:backdrop-blur-[2px] open:animate-entrar sm:mt-0 sm:mr-0 sm:ml-auto sm:h-dvh sm:max-h-dvh sm:w-[30rem] sm:rounded-none"
    >
      <div className="flex max-h-[92dvh] flex-col sm:h-dvh sm:max-h-dvh">
        <header className="flex items-start gap-3 border-b border-linea bg-blanco px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="cifra text-[1.45rem] leading-tight font-bold">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-[0.88rem] text-gris">{descripcion}</p>}
          </div>
          <button type="button" onClick={alCerrar} className="-mr-2 grid size-10 place-items-center rounded-full hover:bg-tinta/6" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {pie && <footer className="border-t border-linea bg-blanco px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">{pie}</footer>}
      </div>
    </dialog>
  );
}

// ------------------------------------------------------------------ Notificaciones
type Nota = { id: number; tono: "ok" | "error" | "info"; texto: string };
const ContextoNotas = createContext<(tono: Nota["tono"], texto: string) => void>(() => {});

export function ProveedorNotas({ children }: { children: ReactNode }) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const avisar = useCallback((tono: Nota["tono"], texto: string) => {
    const id = Date.now() + Math.random();
    setNotas((n) => [...n.slice(-2), { id, tono, texto }]);
    setTimeout(() => setNotas((n) => n.filter((x) => x.id !== id)), tono === "error" ? 7000 : 4000);
  }, []);
  return (
    <ContextoNotas.Provider value={avisar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:items-end"
      >
        {notas.map((n) => (
          <div
            key={n.id}
            className={cx(
              "pointer-events-auto flex w-full max-w-sm animate-entrar items-start gap-2.5 rounded-[var(--radius-placa)] px-4 py-3 text-[0.9rem] font-medium shadow-[var(--shadow-flota)]",
              n.tono === "error" ? "bg-error text-blanco" : "bg-tinta text-blanco",
            )}
          >
            {n.tono === "ok" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-plata-2" /> : n.tono === "error" ? <XCircle className="mt-0.5 size-4 shrink-0" /> : <Info className="mt-0.5 size-4 shrink-0 text-plata-2" />}
            {n.texto}
          </div>
        ))}
      </div>
    </ContextoNotas.Provider>
  );
}

export const useNotas = () => useContext(ContextoNotas);
