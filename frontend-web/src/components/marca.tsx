import { useId } from "react";

/**
 * Isotipo de Jersey Club redibujado en vector desde «Logo sin fondo final .png» (LOGO/Logo nuevo).
 * Variante "metal" reproduce la versión plateada del fondo de tarjetas.
 */
export function Isotipo({
  className = "size-7",
  variante = "metal",
}: {
  className?: string;
  variante?: "metal" | "tinta" | "blanco";
}) {
  const id = `jc-metal-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const relleno = variante === "metal" ? `url(#${id})` : variante === "tinta" ? "#1b1c1e" : "#ffffff";
  return (
    <svg viewBox="40 80 1800 1840" className={className} aria-hidden="true" focusable="false">
      {variante === "metal" && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f4f5f7" />
            <stop offset="0.4" stopColor="#b8bdc3" />
            <stop offset="0.62" stopColor="#eef0f2" />
            <stop offset="1" stopColor="#8c9299" />
          </linearGradient>
        </defs>
      )}
      <polygon points="55,197 828,93 1585,650 1012,962 1818,1300 542,1900 728,704" fill={relleno} />
    </svg>
  );
}

export function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Isotipo className="size-7 shrink-0" />
      {!compacta && (
        <span className="cifra text-[1.35rem] leading-none font-extrabold tracking-[0.04em] uppercase">
          Jersey Club
        </span>
      )}
    </span>
  );
}
