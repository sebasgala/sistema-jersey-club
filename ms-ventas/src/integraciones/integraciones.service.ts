import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AxiosError, type AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import { URLS_SERVICIOS, type UrlsServicios } from './integraciones.config';

/** Resultado tipado de una llamada a otro microservicio. */
export type ResultadoHttp<T> =
  | { tipo: 'ok'; status: number; data: T }
  | {
      tipo: 'error_http';
      status: number;
      error_code: string;
      details: string[];
    }
  | { tipo: 'no_disponible'; motivo: string };

export interface ClienteRemoto {
  id: string;
  tipo_identificacion: string;
  identificacion: string;
  nombre_completo: string;
  telefono: string | null;
  email: string | null;
  provincia: string | null;
  ciudad: string | null;
  direccion_referencia: string | null;
  courier_preferido: string | null;
}

export interface SnapshotVariante {
  variante_id: string;
  producto_id: string;
  codigo_legacy: string | null;
  categoria: string;
  nombre: string;
  marca_equipo: string;
  temporada_coleccion: string | null;
  talla_medida: string;
  version_modelo: string;
  adicional_parche: string | null;
  adicional_dorsal: string | null;
  valor_jersey_club: string;
  pvp_sugerido: string;
}

export interface ResultadoDescuento {
  referencia_id: string;
  items: {
    movimiento: { id: string; cantidad: number };
    snapshot: SnapshotVariante;
  }[];
}

const ERRORES_REINTENTABLES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'EPIPE',
]);
const ESTADOS_REINTENTABLES = new Set([502, 503, 504]);
const MAX_REINTENTOS = 2;

/**
 * Cliente HTTP hacia ms-clientes y ms-inventario.
 * - Timeouts estrictos: 2 s clientes, 3 s inventario.
 * - Hasta 2 reintentos con backoff exponencial SOLO en operaciones idempotentes
 *   (GET y POST con Idempotency-Key) y SOLO ante fallos rápidos (conexión
 *   rechazada/reiniciada, 502/503/504). Un timeout no se reintenta para no
 *   multiplicar la latencia de la venta.
 * - Propaga X-Correlation-Id.
 */
@Injectable()
export class IntegracionesService {
  private readonly logger = new Logger(IntegracionesService.name);

  constructor(
    private readonly http: HttpService,
    @Inject(URLS_SERVICIOS) private readonly urls: UrlsServicios,
  ) {}

  obtenerCliente(
    id: string,
    correlationId: string,
  ): Promise<ResultadoHttp<ClienteRemoto>> {
    return this.llamar<ClienteRemoto>(
      {
        method: 'GET',
        url: `${this.urls.clientes}/clientes/${encodeURIComponent(id)}`,
        timeout: this.urls.timeoutClientesMs,
      },
      correlationId,
    );
  }

  descontarStock(
    referenciaId: string,
    items: { variante_id: string; cantidad: number }[],
    correlationId: string,
  ): Promise<ResultadoHttp<ResultadoDescuento>> {
    return this.llamar<ResultadoDescuento>(
      {
        method: 'POST',
        url: `${this.urls.inventario}/stock/descuentos`,
        timeout: this.urls.timeoutInventarioMs,
        headers: { 'Idempotency-Key': referenciaId },
        data: { referencia_id: referenciaId, items },
      },
      correlationId,
    );
  }

  revertirStock(
    referenciaId: string,
    motivo: string,
    correlationId: string,
  ): Promise<ResultadoHttp<unknown>> {
    return this.llamar(
      {
        method: 'POST',
        url: `${this.urls.inventario}/stock/reversiones`,
        timeout: this.urls.timeoutInventarioMs,
        headers: { 'Idempotency-Key': referenciaId },
        data: { referencia_id: referenciaId, motivo: motivo.slice(0, 300) },
      },
      correlationId,
    );
  }

  private async llamar<T>(
    config: AxiosRequestConfig,
    correlationId: string,
  ): Promise<ResultadoHttp<T>> {
    const destino = `${config.method} ${config.url}`;
    for (let intento = 0; ; intento++) {
      try {
        const res = await firstValueFrom(
          this.http.request<{
            data?: T;
            error_code?: string;
            details?: string[];
          }>({
            ...config,
            headers: { ...config.headers, 'X-Correlation-Id': correlationId },
            validateStatus: () => true,
          }),
        );
        if (res.status >= 200 && res.status < 300) {
          return { tipo: 'ok', status: res.status, data: res.data.data as T };
        }
        if (ESTADOS_REINTENTABLES.has(res.status) && intento < MAX_REINTENTOS) {
          await this.esperar(intento, destino, `HTTP ${res.status}`);
          continue;
        }
        if (res.status >= 500) {
          return {
            tipo: 'no_disponible',
            motivo: `${destino} respondió ${res.status}`,
          };
        }
        return {
          tipo: 'error_http',
          status: res.status,
          error_code: res.data?.error_code ?? 'ERROR_DEPENDENCIA',
          details: res.data?.details ?? [],
        };
      } catch (e) {
        const codigo = e instanceof AxiosError ? (e.code ?? 'ERROR') : 'ERROR';
        if (ERRORES_REINTENTABLES.has(codigo) && intento < MAX_REINTENTOS) {
          await this.esperar(intento, destino, codigo);
          continue;
        }
        const esTimeout = codigo === 'ECONNABORTED' || codigo === 'ETIMEDOUT';
        this.logger.warn(
          `${destino} no disponible (${codigo}) correlation_id=${correlationId}`,
        );
        return {
          tipo: 'no_disponible',
          motivo: esTimeout
            ? `${destino} excedió ${config.timeout} ms`
            : `${destino}: ${codigo}`,
        };
      }
    }
  }

  private async esperar(
    intento: number,
    destino: string,
    motivo: string,
  ): Promise<void> {
    const ms = 150 * 2 ** intento;
    this.logger.warn(
      `Reintento ${intento + 1}/${MAX_REINTENTOS} de ${destino} en ${ms} ms (${motivo})`,
    );
    await new Promise((r) => setTimeout(r, ms));
  }
}
