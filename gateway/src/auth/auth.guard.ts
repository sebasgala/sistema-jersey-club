import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ErrorNegocio } from '../common/errores.filter';

export const ES_PUBLICA = 'es_publica';
/** Marca una ruta como pública (sin JWT). */
export const Publica = () => SetMetadata(ES_PUBLICA, true);

export interface UsuarioToken {
  sub: string;
  rol: string;
}

export interface RequestAutenticada extends Request {
  usuario?: UsuarioToken;
}

/** Guard global: toda ruta exige `Authorization: Bearer <JWT>` salvo las marcadas @Publica(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const publica = this.reflector.getAllAndOverride<boolean>(ES_PUBLICA, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (publica) return true;

    const req = ctx.switchToHttp().getRequest<RequestAutenticada>();
    const [tipo, token] = (req.headers.authorization ?? '').split(' ');
    if (tipo !== 'Bearer' || !token) {
      throw new ErrorNegocio(401, 'NO_AUTENTICADO', [
        'Falta la cabecera Authorization: Bearer <token>',
      ]);
    }
    try {
      req.usuario = await this.jwt.verifyAsync<UsuarioToken>(token);
      return true;
    } catch {
      throw new ErrorNegocio(401, 'TOKEN_INVALIDO', [
        'El token es inválido o expiró',
      ]);
    }
  }
}
