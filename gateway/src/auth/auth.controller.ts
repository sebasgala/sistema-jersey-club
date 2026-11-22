import {
  Body,
  Controller,
  HttpCode,
  Ip,
  OnModuleInit,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcrypt';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Repository } from 'typeorm';
import { ErrorNegocio } from '../common/errores.filter';
import { Respuesta } from '../common/respuesta.interceptor';
import { Publica, type UsuarioToken } from './auth.guard';
import { Usuario } from './usuario.entity';

export class LoginDto {
  /** Nombre de usuario o correo electrónico (sin distinguir mayúsculas). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
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
export class AuthController implements OnModuleInit {
  /** Intentos fallidos por IP (memoria local; suficiente para un único gateway). */
  private readonly fallidos = new Map<string, { n: number; desde: number }>();
  /** Hash de relleno: se compara aunque el usuario no exista, para no revelar por tiempo si existe. */
  private hashRelleno = '';

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.hashRelleno = await hash('relleno-sin-usuario', 12);
  }

  @Publica()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Iniciar sesión con usuario o correo y obtener un JWT con el rol',
  })
  async login(@Body() dto: LoginDto, @Ip() ip: string) {
    const registro = this.fallidos.get(ip);
    const vigente = !!registro && Date.now() - registro.desde < VENTANA_MS;
    if (vigente && registro.n >= MAX_INTENTOS) {
      throw new ErrorNegocio(429, 'DEMASIADOS_INTENTOS', [
        'Demasiados intentos fallidos; espere 15 minutos',
      ]);
    }

    const buscado = dto.usuario.trim().toLowerCase();
    const usuario = await this.usuarios
      .createQueryBuilder('u')
      .where('u.username = :b OR u.email = :b', { b: buscado })
      .getOne();

    // Siempre se ejecuta una comparación bcrypt (con el hash real o el de relleno).
    const claveOk = await compare(
      dto.contrasena,
      usuario?.passwordHash ?? this.hashRelleno,
    );
    if (!usuario || !usuario.activo || !claveOk) {
      this.fallidos.set(ip, {
        n: vigente ? registro.n + 1 : 1,
        desde: vigente ? registro.desde : Date.now(),
      });
      throw new ErrorNegocio(401, 'CREDENCIALES_INVALIDAS', [
        'Usuario o contraseña incorrectos',
      ]);
    }
    this.fallidos.delete(ip);

    const carga: UsuarioToken = {
      sub: usuario.id,
      username: usuario.username,
      email: usuario.email,
      nombre: usuario.nombreCompleto,
      role: usuario.role,
    };
    const expiraEn = Number(this.config.get('JWT_EXPIRES_IN_SEGUNDOS', 28800));
    const token = await this.jwt.signAsync(
      { ...carga },
      { expiresIn: expiraEn },
    );
    return new Respuesta('Sesión iniciada', {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiraEn,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        email: usuario.email,
        nombre: usuario.nombreCompleto,
        role: usuario.role,
      },
    });
  }
}
