"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Isotipo } from "@/components/marca";
import { mensajeError, post } from "@/lib/api";
import { guardarSesion, obtenerSesion, type Rol } from "@/lib/sesion";

interface RespuestaLogin {
  access_token: string;
  expires_in: number;
  usuario: { id: string; username: string; email: string; nombre: string; role: Rol };
}

/** Gotas fijas (no aleatorias): el render del servidor y el del navegador coinciden. */
const GOTAS = [
  { tam: 260, izq: 6, arriba: 58, retraso: -3, duracion: 22 },
  { tam: 340, izq: 74, arriba: 22, retraso: -11, duracion: 27 },
  { tam: 190, izq: 48, arriba: 84, retraso: -7, duracion: 19 },
  { tam: 230, izq: 18, arriba: 12, retraso: -15, duracion: 25 },
  { tam: 170, izq: 86, arriba: 72, retraso: -5, duracion: 21 },
  { tam: 150, izq: 38, arriba: 40, retraso: -18, duracion: 30 },
];

/** Fondo de mercurio líquido: gotas que flotan y se funden, con un leve paralaje al mover el mouse. */
function FondoMercurio() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const alMover = (e: MouseEvent) => {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      refs.current.forEach((gota, i) => {
        if (!gota) return;
        // Márgenes (no transform) para no pisar la animación de flotación.
        gota.style.marginLeft = `${x * (i + 1) * 20}px`;
        gota.style.marginTop = `${y * (i + 1) * 20}px`;
      });
    };
    document.addEventListener("mousemove", alMover);
    return () => document.removeEventListener("mousemove", alMover);
  }, []);

  return (
    <>
      <svg className="absolute size-0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="mercurio-viscoso">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="desenfoque" />
            <feColorMatrix in="desenfoque" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="viscoso" />
            <feComposite in="SourceGraphic" in2="viscoso" operator="atop" />
          </filter>
        </defs>
      </svg>
      <div className="mercurio-escena pointer-events-none absolute inset-0 z-0 opacity-45" aria-hidden="true">
        {GOTAS.map((g, i) => (
          <div
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="mercurio-gota"
            style={{
              width: g.tam,
              height: g.tam,
              left: `${g.izq}%`,
              top: `${g.arriba}%`,
              animationDelay: `${g.retraso}s`,
              animationDuration: `${g.duracion}s`,
            }}
          />
        ))}
      </div>
    </>
  );
}

function MotivoSesion() {
  const motivo = useSearchParams().get("motivo");
  if (motivo !== "expirada") return null;
  return (
    <p role="status" className="mb-8 rounded-md border border-[#f3c56b]/30 bg-[#f3c56b]/10 px-4 py-3 text-[0.9rem] text-[#f3c56b]">
      Tu sesión terminó. Vuelve a iniciar sesión para continuar.
    </p>
  );
}

const CLASE_ENTRADA =
  "peer w-full border-0 border-b border-white/15 bg-transparent py-3 text-[1.15rem] text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/40 " +
  "[&:-webkit-autofill]:[-webkit-text-fill-color:#fff] [&:-webkit-autofill]:shadow-[inset_0_0_0_100px_#050505]";

export default function Login() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [ver, setVer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (obtenerSesion()) router.replace("/dashboard/");
  }, [router]);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !contrasena) {
      setError("Escribe tu usuario y contraseña.");
      return;
    }
    setEnviando(true);
    setError(null);
    try {
      const r = await post<RespuestaLogin>("/auth/login", { usuario: usuario.trim(), contrasena }, { sinAuth: true });
      const u = r.data.usuario;
      guardarSesion({
        token: r.data.access_token,
        expiraEn: Date.now() + r.data.expires_in * 1000 - 30_000,
        id: u.id,
        username: u.username,
        email: u.email,
        nombre: u.nombre,
        role: u.role,
      });
      // El vendedor entra directo a vender; el administrador, al panel.
      router.replace(u.role === "VENDEDOR" ? "/ventas/nueva/" : "/dashboard/");
    } catch (e) {
      setError(mensajeError(e));
      setEnviando(false);
    }
  }

  return (
    <div className="sobre-tinta relative grid min-h-dvh place-items-center overflow-hidden bg-[#050505] text-white">
      <FondoMercurio />

      <main className="relative z-10 w-full max-w-[440px] px-6 py-10 sm:px-10">
        <header className="mb-14 flex items-center gap-3 sm:mb-16">
          <h1 className="text-[2.6rem] leading-[0.9] font-bold tracking-[-0.045em] sm:text-[3.2rem]">
            JERSEY
            <br />
            CLUB
          </h1>
          <Isotipo variante="blanco" className="size-24 shrink-0 self-center sm:size-32" />
        </header>

        <Suspense>
          <MotivoSesion />
        </Suspense>

        <form onSubmit={entrar} noValidate autoComplete="off">
          <div className="relative mb-8 transition-transform duration-500 ease-[cubic-bezier(0.2,1,0.3,1)] focus-within:translate-x-2.5">
            <label htmlFor="usuario" className="mb-2 block text-[0.78rem] font-medium tracking-[0.14em] text-white/85 uppercase">
              Usuario o correo
            </label>
            <input
              id="usuario"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              className={CLASE_ENTRADA}
            />
            <span className="pointer-events-none absolute bottom-0 left-0 h-[2px] w-0 bg-[#e0e0e0] shadow-[0_0_15px_#e0e0e0] transition-[width] duration-[600ms] ease-[cubic-bezier(0.2,1,0.3,1)] peer-focus:w-full" />
          </div>

          <div className="relative mb-8 transition-transform duration-500 ease-[cubic-bezier(0.2,1,0.3,1)] focus-within:translate-x-2.5">
            <label htmlFor="contrasena" className="mb-2 block text-[0.78rem] font-medium tracking-[0.14em] text-white/85 uppercase">
              Contraseña
            </label>
            <input
              id="contrasena"
              type={ver ? "text" : "password"}
              autoComplete="current-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              className={`${CLASE_ENTRADA} pr-12`}
            />
            <span className="pointer-events-none absolute bottom-0 left-0 h-[2px] w-0 bg-[#e0e0e0] shadow-[0_0_15px_#e0e0e0] transition-[width] duration-[600ms] ease-[cubic-bezier(0.2,1,0.3,1)] peer-focus:w-full" />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
              aria-pressed={ver}
              className="absolute right-0 bottom-1.5 grid size-9 place-items-center rounded-full text-white/55 transition-colors hover:text-white"
            >
              {ver ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          </div>

          {error && (
            <p role="alert" className="mb-2 rounded-md border border-[#ff9aa3]/30 bg-[#ff9aa3]/10 px-4 py-3 text-[0.92rem] text-[#ff9aa3]">
              {error}
            </p>
          )}

          <div className="mercurio-boton relative mt-10">
            <div className="mercurio-gota-boton" aria-hidden="true" />
            <button
              type="submit"
              disabled={enviando}
              className="relative z-[2] flex w-full items-center justify-center gap-2 rounded-[14px] bg-white px-10 py-5 text-[0.9rem] font-extrabold tracking-[0.16em] text-black uppercase transition-[letter-spacing] duration-300 hover:tracking-[0.24em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-wait disabled:opacity-80"
            >
              {enviando && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Entrar
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
