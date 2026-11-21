import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { opcionesTypeOrm } from './common/database.config';
import { SaludController } from './common/salud.controller';
import { IntegracionesModule } from './integraciones/integraciones.module';
import { OutboxModule } from './outbox/outbox.module';
import { VentasModule } from './ventas/ventas.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: opcionesTypeOrm,
    }),
    IntegracionesModule,
    VentasModule,
    OutboxModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
