import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ProxyController } from './proxy/proxy.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule.register({}),
    // AuthModule primero: /auth/login se registra antes que las rutas del proxy.
    AuthModule,
  ],
  controllers: [ProxyController],
})
export class AppModule {}
