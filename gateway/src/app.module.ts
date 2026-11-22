import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { opcionesTypeOrm } from './common/database.config';
import { ProxyController } from './proxy/proxy.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule.register({}),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: opcionesTypeOrm,
    }),
    // AuthModule primero: /auth/login se registra antes que las rutas del proxy.
    AuthModule,
  ],
  controllers: [ProxyController],
})
export class AppModule {}
