import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Variante } from './entities/variante.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Variante])],
  exports: [TypeOrmModule],
})
export class VariantesModule {}
