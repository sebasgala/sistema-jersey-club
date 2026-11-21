import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, map } from 'rxjs';

export interface RespuestaApi<T> {
  status: number;
  message: string;
  data: T;
}

/** Resultado que un controlador puede devolver para fijar el mensaje. */
export class Respuesta<T> {
  constructor(
    readonly message: string,
    readonly data: T,
  ) {}
}

/** Envuelve toda respuesta exitosa en `{ status, message, data }`. */
@Injectable()
export class RespuestaInterceptor<T> implements NestInterceptor<
  T,
  RespuestaApi<unknown>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<RespuestaApi<unknown>> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((resultado) => {
        if (resultado instanceof Respuesta) {
          return {
            status: res.statusCode,
            message: resultado.message,
            data: resultado.data as unknown,
          };
        }
        return {
          status: res.statusCode,
          message: 'Operación exitosa',
          data: resultado ?? null,
        };
      }),
    );
  }
}
