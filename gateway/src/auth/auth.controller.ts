import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ErrorNegocio } from '../common/errores.filter';
import { Respuesta } from '../common/respuesta.interceptor';
import { Publica } from './auth.guard';
import { igualesSeguro, verificarHash } from './password.util';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  usuario!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  contrasena!: string;
}

const MAX_INTENTOS = 5;
const VENTANA_MS = 15 * 60 * 1000;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  /** Intentos fallidos por IP (memoria local; suficiente para un único gateway). */
  private readonly fallidos = new Map<string, { n: number; desde: number }>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Publica()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Iniciar sesión como administrador y obtener un JWT',
  })
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    const registro = this.fallidos.get(ip);
    if (
      registro &&
      Date.now() - registro.desde < VENTANA_MS &&
      registro.n >= MAX_INTENTOS
    ) {
      throw new ErrorNegocio(429, 'DEMASIADOS_INTENTOS', [
        'Demasiados intentos fallidos; espere 15 minutos',
      ]);
    }

    const usuario = this.config.getOrThrow<string>('ADMIN_USUARIO');
    const hash = this.config.getOrThrow<string>('ADMIN_PASSWORD_HASH');
    // Se evalúan ambas comparaciones siempre para no filtrar cuál falló.
    const usuarioOk = igualesSeguro(dto.usuario, usuario);
    const claveOk = verificarHash(dto.contrasena, hash);
    if (!usuarioOk || !claveOk) {
      const vigente = registro && Date.now() - registro.desde < VENTANA_MS;
      this.fallidos.set(ip, {
        n: vigente ? registro.n + 1 : 1,
        desde: vigente ? registro.desde : Date.now(),
      });
      throw new ErrorNegocio(401, 'CREDENCIALES_INVALIDAS', [
        'Usuario o contraseña incorrectos',
      ]);
    }
    this.fallidos.delete(ip);

    const expiraEn = Number(this.config.get('JWT_EXPIRES_IN_SEGUNDOS', 28800));
    const token = await this.jwt.signAsync(
      { sub: usuario, rol: 'ADMIN' },
      { expiresIn: expiraEn },
    );
    return new Respuesta('Sesión iniciada', {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiraEn,
      usuario: { nombre: usuario, rol: 'ADMIN' },
    });
  }
}
