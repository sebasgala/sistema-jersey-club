import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovimientoStock } from './entities/movimiento-stock.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MovimientoStock])],
  exports: [TypeOrmModule],
})
export class StockModule {}
