"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Isotipo } from "@/components/marca";
import { Aviso, Boton, Campo } from "@/components/ui";
import { mensajeError, post } from "@/lib/api";
import { guardarSesion, obtenerSesion, type Rol } from "@/lib/sesion";

interface RespuestaLogin {
  access_token: string;
  expires_in: number;
  usuario: { id: string; username: string; email: string; nombre: string; role: Rol };
}

function MotivoSesion() {
  const motivo = useSearchParams().get("motivo");
  if (motivo !== "expirada") return null;
  return (
    <Aviso tono="alerta" titulo="Tu sesión terminó" className="mb-5">
      Vuelve a iniciar sesión para continuar.
    </Aviso>
  );
}

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
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="sobre-tinta relative flex flex-col justify-between overflow-hidden bg-tinta px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-8 text-blanco lg:px-14 lg:py-14">
        <span className="cifra text-[1.35rem] font-extrabold tracking-[0.04em] uppercase">Jersey Club</span>
        <Isotipo className="pointer-events-none absolute top-6 right-5 size-14 sm:top-8 sm:right-10 sm:size-36 lg:top-[9%] lg:right-[9%] lg:size-[21rem]" />
        <div className="relative mt-16 max-w-md lg:mt-0">
          <h1 className="cifra text-[2.6rem] leading-[0.95] font-extrabold tracking-[-0.01em] uppercase sm:text-[3.4rem] lg:text-[4.4rem]">
            Stock exacto.
            <br />
            Ganancia real.
          </h1>
          <p className="mt-4 max-w-sm text-[1rem] text-humo">
            Inventario por variante, ventas en un paso y el costo de cada camiseta a la vista.
          </p>
        </div>
      </section>

      <section className="flex items-start justify-center px-5 py-8 sm:items-center sm:px-8">
        <form onSubmit={entrar} className="w-full max-w-sm" noValidate>
          <h2 className="cifra text-[2rem] leading-none font-bold">Iniciar sesión</h2>
          <p className="mt-2 mb-6 text-gris">Entra con tu usuario o tu correo.</p>
          <Suspense>
            <MotivoSesion />
          </Suspense>
          <div className="flex flex-col gap-4">
            <Campo etiqueta="Usuario o correo" autoComplete="username" autoCapitalize="none" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
            <Campo
              etiqueta="Contraseña"
              type={ver ? "text" : "password"}
              autoComplete="current-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              claseInput="pr-12"
            />
            <button
              type="button"
              onClick={() => setVer((v) => !v)}
              className="-mt-2 flex items-center gap-1.5 self-start text-[0.85rem] font-medium text-gris hover:text-tinta"
            >
              {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {ver ? "Ocultar contraseña" : "Mostrar contraseña"}
            </button>
            {error && <Aviso tono="error" titulo={error} />}
            <Boton type="submit" tamano="lg" cargando={enviando} icono={LogIn} className="mt-1 w-full">
              Entrar
            </Boton>
          </div>
        </form>
      </section>
    </div>
  );
}
