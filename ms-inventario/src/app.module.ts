import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { opcionesTypeOrm } from './common/database.config';
import { SaludController } from './common/salud.controller';
import { ProductosModule } from './productos/productos.module';
import { StockModule } from './stock/stock.module';
import { VariantesModule } from './variantes/variantes.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: opcionesTypeOrm,
    }),
    ProductosModule,
    VariantesModule,
    StockModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
