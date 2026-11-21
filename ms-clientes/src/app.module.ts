import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientesModule } from './clientes/clientes.module';
import { opcionesTypeOrm } from './common/database.config';
import { SaludController } from './common/salud.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: opcionesTypeOrm,
    }),
    ClientesModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
