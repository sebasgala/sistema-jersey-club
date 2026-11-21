import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';
import type { RequestConCorrelacion } from './correlation-id.middleware';

export interface ErrorApi {
  status: number;
  error: string;
  details: string[];
  error_code: string;
  correlation_id: string | null;
}

/**
 * Excepción de negocio con `error_code` explícito.
 * Ej.: throw new ErrorNegocio(409, 'STOCK_INSUFICIENTE', ['Variante X: solicitado 2, disponible 1'])
 */
export class ErrorNegocio extends HttpException {
  constructor(status: number, errorCode: string, details: string[] = []) {
    super({ error_code: errorCode, details }, status);
  }
}

const CODIGO_POR_ESTADO: Record<number, string> = {
  400: 'VALIDACION_FALLIDA',
  401: 'NO_AUTENTICADO',
  403: 'NO_AUTORIZADO',
  404: 'RECURSO_NO_ENCONTRADO',
  409: 'CONFLICTO',
  422: 'ENTIDAD_NO_PROCESABLE',
  503: 'SERVICIO_NO_DISPONIBLE',
};

/** Produce siempre `{ status, error, details[], error_code, correlation_id }`. */
@Catch()
export class ErroresFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErroresFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestConCorrelacion>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let details: string[] = ['Error interno del servidor'];
    let errorCode = 'ERROR_INTERNO';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const cuerpo = exception.getResponse();
      errorCode = CODIGO_POR_ESTADO[status] ?? 'ERROR_HTTP';
      if (typeof cuerpo === 'string') {
        details = [cuerpo];
      } else {
        const c = cuerpo as {
          message?: string | string[];
          details?: string[];
          error_code?: string;
        };
        if (c.error_code) errorCode = c.error_code;
        if (c.details?.length) details = c.details;
        else if (Array.isArray(c.message)) details = c.message;
        else if (c.message) details = [c.message];
        else details = [];
      }
    } else if (exception instanceof QueryFailedError) {
      const codigoPg = (exception.driverError as { code?: string } | undefined)
        ?.code;
      if (codigoPg === '23505') {
        status = HttpStatus.CONFLICT;
        errorCode = 'REGISTRO_DUPLICADO';
        details = ['Ya existe un registro con esos datos únicos'];
      } else if (codigoPg === '23514') {
        status = HttpStatus.CONFLICT;
        errorCode = 'RESTRICCION_INCUMPLIDA';
        details = ['La operación incumple una regla de integridad'];
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    } else {
      const e = exception as Error;
      this.logger.error(e?.message, e?.stack);
    }

    const cuerpo: ErrorApi = {
      status,
      error: (HttpStatus[status] ?? 'Error')
        .toString()
        .toLowerCase()
        .split('_')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' '),
      details,
      error_code: errorCode,
      correlation_id: req.correlationId ?? null,
    };
    res.status(status).json(cuerpo);
  }
}
