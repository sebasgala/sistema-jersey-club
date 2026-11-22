import { HttpService } from '@nestjs/axios';
import { All, Controller, Get, Logger, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AxiosError } from 'axios';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { Publica, type RequestAutenticada } from '../auth/auth.guard';
import type { RequestConCorrelacion } from '../common/correlation-id.middleware';
import { Respuesta } from '../common/respuesta.interceptor';
import { ocultarCostos, rolPermitido } from './permisos';

type Servicio = 'inventario' | 'ventas' | 'clientes';

/** Primer segmento del recurso → microservicio dueño. */
const RUTAS: Record<string, Servicio> = {
  productos: 'inventario',
  variantes: 'inventario',
  stock: 'inventario',
  ventas: 'ventas',
  clientes: 'clientes',
};

/** Cabeceras que se propagan hacia y desde los microservicios. */
const CABECERAS_IDA = ['content-type', 'accept', 'idempotency-key'];
const CABECERAS_VUELTA = ['content-type', 'location', 'idempotent-replayed'];

const RUTAS_PROXY = Object.keys(RUTAS).flatMap((r) => [r, `${r}/*ruta`]);

@ApiTags('gateway')
@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);
  private readonly destinos: Record<Servicio, string>;
  private readonly timeoutMs: number;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.destinos = {
      inventario: config.getOrThrow<string>('INVENTARIO_URL'),
      ventas: config.getOrThrow<string>('VENTAS_URL'),
      clientes: config.getOrThrow<string>('CLIENTES_URL'),
    };
    this.timeoutMs = Number(config.get('GATEWAY_TIMEOUT_MS', 15000));
  }

  @Publica()
  @Get('salud')
  @ApiOperation({ summary: 'Estado del gateway y de cada microservicio' })
  async salud(@Req() req: RequestConCorrelacion) {
    const estados = await Promise.all(
      (Object.keys(this.destinos) as Servicio[]).map(async (s) => {
        try {
          const r = await firstValueFrom(
            this.http.get(`${this.destinos[s]}/api/v1/salud`, {
              timeout: 2000,
              headers: { 'X-Correlation-Id': req.correlationId },
              validateStatus: () => true,
            }),
          );
          return [
            `ms-${s}`,
            r.status === 200 ? 'OK' : `HTTP ${r.status}`,
          ] as const;
        } catch {
          return [`ms-${s}`, 'NO_DISPONIBLE'] as const;
        }
      }),
    );
    return new Respuesta('Gateway operativo', {
      gateway: 'OK',
      servicios: Object.fromEntries(estados),
    });
  }

  @All(RUTAS_PROXY)
  @ApiBearerAuth()
  @ApiExcludeEndpoint()
  async reenviar(
    @Req() req: RequestAutenticada & RequestConCorrelacion,
    @Res() res: Response,
  ): Promise<void> {
    const recurso = req.path.replace(/^\/api\/v1\//, '').split('/')[0] ?? '';
    const servicio = RUTAS[recurso];
    const correlationId = req.correlationId ?? '';
    if (!servicio) {
      this.error(
        res,
        404,
        'RUTA_NO_ENCONTRADA',
        [`No existe la ruta ${req.path}`],
        correlationId,
      );
      return;
    }

    const usuario = req.usuario;
    if (!usuario) {
      this.error(
        res,
        401,
        'NO_AUTENTICADO',
        ['Sesión no válida'],
        correlationId,
      );
      return;
    }
    const segmentos = req.path
      .replace(/^\/api\/v1\//, '')
      .split('/')
      .filter(Boolean);
    if (!rolPermitido(usuario.role, req.method, segmentos)) {
      this.error(
        res,
        403,
        'ROL_NO_AUTORIZADO',
        [
          `El rol ${usuario.role} no puede ejecutar ${req.method} /${segmentos.join('/')}`,
        ],
        correlationId,
      );
      return;
    }

    // Solo se reenvían cabeceras de la lista blanca: un X-User-Id enviado por el cliente nunca llega a los servicios.
    const headers: Record<string, string> = {
      'X-Correlation-Id': correlationId,
      'X-User-Id': usuario.sub,
      'X-User-Role': usuario.role,
    };
    for (const h of CABECERAS_IDA) {
      const valor = req.headers[h];
      if (typeof valor === 'string') headers[h] = valor;
    }
    const conCuerpo = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

    try {
      const r = await firstValueFrom(
        this.http.request<Buffer>({
          method: req.method,
          url: `${this.destinos[servicio]}${req.originalUrl}`,
          headers,
          data: conCuerpo ? (req.body as unknown) : undefined,
          timeout: this.timeoutMs,
          responseType: 'arraybuffer',
          validateStatus: () => true,
          maxRedirects: 0,
        }),
      );
      res.status(r.status);
      for (const h of CABECERAS_VUELTA) {
        const valor = r.headers[h] as string | undefined;
        if (valor) res.setHeader(h, valor);
      }
      const cuerpo = Buffer.from(r.data);
      const esJson = String(r.headers['content-type'] ?? '').includes(
        'application/json',
      );
      if (usuario.role === 'VENDEDOR' && esJson && cuerpo.length) {
        // Un vendedor no recibe costos ni ganancias en ninguna respuesta.
        try {
          res.json(ocultarCostos(JSON.parse(cuerpo.toString('utf8'))));
          return;
        } catch {
          /* no era JSON válido: se envía tal cual */
        }
      }
      res.send(cuerpo);
    } catch (e) {
      const codigo = e instanceof AxiosError ? e.code : undefined;
      const timeout = codigo === 'ECONNABORTED' || codigo === 'ETIMEDOUT';
      this.logger.warn(
        `ms-${servicio} no disponible (${codigo}) correlation_id=${correlationId}`,
      );
      this.error(
        res,
        timeout ? 504 : 503,
        timeout ? 'TIEMPO_AGOTADO' : 'SERVICIO_NO_DISPONIBLE',
        [
          timeout
            ? `ms-${servicio} no respondió a tiempo`
            : `ms-${servicio} no está disponible`,
        ],
        correlationId,
      );
    }
  }

  private error(
    res: Response,
    status: number,
    errorCode: string,
    details: string[],
    correlationId: string,
  ): void {
    const nombres: Record<number, string> = {
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };
    res.status(status).json({
      status,
      error: nombres[status] ?? 'Error',
      details,
      error_code: errorCode,
      correlation_id: correlationId || null,
    });
  }
}
