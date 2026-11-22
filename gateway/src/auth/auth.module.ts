import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './auth.guard';
import { Usuario } from './usuario.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secreto = config.getOrThrow<string>('JWT_SECRET');
        if (secreto.length < 32) {
          throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
        }
        return {
          secret: secreto,
          signOptions: { issuer: 'jersey-club-gateway' },
          verifyOptions: { issuer: 'jersey-club-gateway' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AuthModule {}
