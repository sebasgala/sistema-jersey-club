import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { URLS_SERVICIOS, type UrlsServicios } from './integraciones.config';
import { IntegracionesService } from './integraciones.service';

/**
 * Clientes HTTP hacia ms-inventario y ms-clientes (comunicación síncrona REST).
 * Timeouts por defecto según docs/04: 3 s inventario, 2 s clientes.
 */
@Global()
@Module({
  imports: [HttpModule.register({ maxRedirects: 0 })],
  providers: [
    {
      provide: URLS_SERVICIOS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): UrlsServicios => ({
        inventario: config.getOrThrow<string>('INVENTARIO_URL'),
        clientes: config.getOrThrow<string>('CLIENTES_URL'),
        timeoutInventarioMs: Number(config.get('INVENTARIO_TIMEOUT_MS', 3000)),
        timeoutClientesMs: Number(config.get('CLIENTES_TIMEOUT_MS', 2000)),
      }),
    },
    IntegracionesService,
  ],
  exports: [IntegracionesService],
})
export class IntegracionesModule {}
