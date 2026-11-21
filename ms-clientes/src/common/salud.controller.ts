import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { ErrorNegocio } from './errores.filter';
import { Respuesta } from './respuesta.interceptor';

@ApiTags('salud')
@Controller('salud')
export class SaludController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado del servicio y de su conexión a la base' })
  async obtener() {
    try {
      const filas: { esquema: string }[] = await this.dataSource.query(
        'SELECT current_schema() AS esquema',
      );
      return new Respuesta('Servicio operativo', {
        servicio: this.config.get<string>('SERVICE_NAME'),
        esquema: filas[0]?.esquema ?? null,
        base_datos: 'OK',
      });
    } catch {
      throw new ErrorNegocio(503, 'BASE_DATOS_NO_DISPONIBLE', [
        'No hay conexión con PostgreSQL',
      ]);
    }
  }
}
