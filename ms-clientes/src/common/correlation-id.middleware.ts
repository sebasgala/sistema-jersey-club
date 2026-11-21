import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CABECERA_CORRELATION_ID = 'x-correlation-id';

export interface RequestConCorrelacion extends Request {
  correlationId?: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Acepta `X-Correlation-Id` (si es un UUID válido) o genera uno nuevo,
 * lo deja en la petición y lo devuelve en la respuesta.
 */
export function correlationIdMiddleware(
  req: RequestConCorrelacion,
  res: Response,
  next: NextFunction,
): void {
  const recibido = req.header(CABECERA_CORRELATION_ID);
  const correlationId =
    recibido && UUID_REGEX.test(recibido) ? recibido : randomUUID();
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);
  next();
}
