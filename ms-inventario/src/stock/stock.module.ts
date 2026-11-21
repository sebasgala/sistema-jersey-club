import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MovimientoStock } from './entities/movimiento-stock.entity';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [TypeOrmModule.forFeature([MovimientoStock])],
  controllers: [StockController],
  providers: [StockService],
  exports: [TypeOrmModule],
})
export class StockModule {}
