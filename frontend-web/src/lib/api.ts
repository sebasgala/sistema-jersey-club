import { cerrarSesion, obtenerSesion } from "./sesion";

/**
 * Cliente HTTP único hacia el gateway. Nunca llama a los microservicios directamente.
 * - Adjunta Authorization: Bearer <JWT>.
 * - Genera un X-Correlation-Id por petición.
 * - Interpreta { status, message, data } y { status, error, details, error_code, correlation_id }.
 * - Ante 401 cierra la sesión y lleva al login.
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3010/api/v1").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    readonly detalles: string[],
    readonly correlationId: string,
  ) {
    super(detalles[0] ?? codigo);
    this.name = "ApiError";
  }

  /** Mensaje para la persona usuaria, en español y con la causa. */
  get mensaje(): string {
    return MENSAJES[this.codigo] ?? this.detalles[0] ?? "Ocurrió un error inesperado.";
  }
}

const MENSAJES: Record<string, string> = {
  SIN_CONEXION: "No hay conexión con el servidor. Revisa tu internet o que el sistema esté encendido.",
  SERVICIO_NO_DISPONIBLE: "Ese módulo no responde en este momento. Intenta de nuevo en unos segundos.",
  TIEMPO_AGOTADO: "El servidor tardó demasiado en responder. Intenta de nuevo.",
  CREDENCIALES_INVALIDAS: "Usuario o contraseña incorrectos.",
  DEMASIADOS_INTENTOS: "Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar.",
  INVENTARIO_NO_DISPONIBLE: "El inventario no responde, así que la venta no se registró. Intenta de nuevo en unos segundos.",
};

export interface Respuesta<T> {
  status: number;
  message: string;
  data: T;
  headers: Headers;
}

type ValorQuery = string | number | boolean | null | undefined;

export interface OpcionesApi {
  query?: Record<string, ValorQuery>;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  sinAuth?: boolean;
}

export async function api<T>(
  metodo: "GET" | "POST" | "PATCH",
  ruta: string,
  op: OpcionesApi = {},
): Promise<Respuesta<T>> {
  const url = new URL(`${API_URL}${ruta}`);
  for (const [k, v] of Object.entries(op.query ?? {})) {
    if (v !== undefined && v !== null && v !== "" && v !== false) url.searchParams.set(k, String(v));
  }
  const correlationId = crypto.randomUUID();
  const headers: Record<string, string> = { Accept: "application/json", "X-Correlation-Id": correlationId };
  if (op.body !== undefined) headers["Content-Type"] = "application/json";
  if (op.idempotencyKey) headers["Idempotency-Key"] = op.idempotencyKey;
  const sesion = op.sinAuth ? null : obtenerSesion();
  if (sesion) headers.Authorization = `Bearer ${sesion.token}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: metodo,
      headers,
      body: op.body !== undefined ? JSON.stringify(op.body) : undefined,
      signal: op.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError(0, "SIN_CONEXION", [], correlationId);
  }

  const cuerpo = (await res.json().catch(() => null)) as
    | { status?: number; message?: string; data?: T; error_code?: string; details?: string[]; correlation_id?: string }
    | null;

  if (!res.ok) {
    if (res.status === 401 && !op.sinAuth) {
      cerrarSesion();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        // Fuera de React no hay router: recarga completa hacia el login (también limpia el estado en memoria).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login/?motivo=expirada");
      }
    }
    throw new ApiError(
      res.status,
      cuerpo?.error_code ?? `HTTP_${res.status}`,
      cuerpo?.details ?? [],
      cuerpo?.correlation_id ?? res.headers.get("x-correlation-id") ?? correlationId,
    );
  }
  return {
    status: res.status,
    message: cuerpo?.message ?? "",
    data: cuerpo?.data as T,
    headers: res.headers,
  };
}

export const get = <T>(ruta: string, op?: OpcionesApi) => api<T>("GET", ruta, op);
export const post = <T>(ruta: string, body: unknown, op?: OpcionesApi) => api<T>("POST", ruta, { ...op, body });
export const patch = <T>(ruta: string, body: unknown, op?: OpcionesApi) => api<T>("PATCH", ruta, { ...op, body });

export function mensajeError(e: unknown): string {
  if (e instanceof ApiError) return e.mensaje;
  return "Ocurrió un error inesperado.";
}
