import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { RequestConCorrelacion } from './correlation-id.middleware';
import { ErrorNegocio } from './errores.filter';

/** Inyecta el `X-Correlation-Id` de la petición actual. */
export const CorrelationId = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): string =>
    ctx.switchToHttp().getRequest<RequestConCorrelacion>().correlationId ?? '',
);

export interface UsuarioContexto {
  id: string | null;
  role: 'ADMIN' | 'VENDEDOR' | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Usuario autenticado que el gateway propaga en `X-User-Id` y `X-User-Role`.
 * Los microservicios confían en estas cabeceras: solo deben ser alcanzables desde el gateway.
 */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, ctx: ExecutionContext): UsuarioContexto => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const id = req.header('x-user-id');
    const role = req.header('x-user-role');
    return {
      id: id && UUID_REGEX.test(id) ? id : null,
      role: role === 'ADMIN' || role === 'VENDEDOR' ? role : null,
    };
  },
);

/**
 * Valida la cabecera `Idempotency-Key`: obligatoria, 8..max caracteres,
 * solo [A-Za-z0-9_-:.]. Devuelve la clave limpia.
 */
export function exigirIdempotencyKey(
  valor: string | undefined,
  max: number,
): string {
  const clave = (valor ?? '').trim();
  if (!clave) {
    throw new ErrorNegocio(400, 'IDEMPOTENCY_KEY_REQUERIDA', [
      'La cabecera Idempotency-Key es obligatoria en esta operación',
    ]);
  }
  if (clave.length < 8 || clave.length > max || !/^[\w\-:.]+$/.test(clave)) {
    throw new ErrorNegocio(400, 'IDEMPOTENCY_KEY_INVALIDA', [
      `Idempotency-Key debe tener entre 8 y ${max} caracteres [A-Za-z0-9_-:.]`,
    ]);
  }
  return clave;
}

export class PaginacionDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export interface Pagina<T> {
  items: T[];
  meta: { page: number; limit: number; total: number };
}

/** Patrón ILIKE seguro: escapa los comodines del usuario. */
export function patronLike(texto: string): string {
  return `%${texto.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Convierte 'true'/'false' de query string a boolean. */
export function aBooleano({ value }: { value: unknown }): unknown {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}

/** Texto limpio en mayúsculas o null si queda vacío. */
export function mayusculas(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const limpio = valor.replace(/\s+/g, ' ').trim().toUpperCase();
  return limpio === '' ? null : limpio;
}
