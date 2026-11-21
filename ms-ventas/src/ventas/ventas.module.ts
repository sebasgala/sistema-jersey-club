import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvento } from '../outbox/entities/outbox-evento.entity';
import { DetalleVenta } from './entities/detalle-venta.entity';
import { Venta } from './entities/venta.entity';
import { VentasController } from './ventas.controller';
import { VentasService } from './ventas.service';

@Module({
  imports: [TypeOrmModule.forFeature([Venta, DetalleVenta, OutboxEvento])],
  controllers: [VentasController],
  providers: [VentasService],
})
export class VentasModule {}
