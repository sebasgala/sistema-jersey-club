import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Respuesta } from '../common/respuesta.interceptor';
import {
  ActualizarPreciosDto,
  ActualizarVarianteDto,
  BuscarVariantesDto,
  CrearVarianteDto,
} from './dto/variante.dto';
import { VariantesService } from './variantes.service';

@ApiTags('variantes')
@Controller('variantes')
export class VariantesController {
  constructor(private readonly variantes: VariantesService) {}

  @Get()
  @ApiOperation({
    summary: 'Buscar variantes con filtros rápidos y KPIs de inventario',
    description:
      'Los KPIs (total SKUs, unidades, valorización a costo JRS y a PVP, SKUs sin costo) se calculan sobre todo el conjunto filtrado, no solo la página.',
  })
  async buscar(@Query() filtro: BuscarVariantesDto) {
    return new Respuesta(
      'Variantes encontradas',
      await this.variantes.buscar(filtro),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener variante con su producto' })
  async obtener(@Param('id', new ParseUUIDPipe()) id: string) {
    return new Respuesta(
      'Variante encontrada',
      await this.variantes.obtener(id),
    );
  }

  @Post()
  @ApiOperation({
    summary:
      'Crear variante (nace con stock 0; el stock entra por /stock/ajustes)',
  })
  async crear(
    @Body() dto: CrearVarianteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const variante = await this.variantes.crear(dto);
    res.location(`/api/v1/variantes/${variante.id}`);
    return new Respuesta('Variante creada', variante);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar atributos de la variante (nunca stock ni precios)',
  })
  async actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ActualizarVarianteDto,
  ) {
    return new Respuesta(
      'Variante actualizada',
      await this.variantes.actualizar(id, dto),
    );
  }

  @Patch(':id/precios')
  @ApiOperation({
    summary: 'Actualizar costo JRS (valor_jersey_club) y/o PVP sugerido',
  })
  async actualizarPrecios(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ActualizarPreciosDto,
  ) {
    const { variante, advertencias } = await this.variantes.actualizarPrecios(
      id,
      dto,
    );
    return new Respuesta(
      advertencias.length
        ? `Precios actualizados. Atención: ${advertencias.join('; ')}`
        : 'Precios actualizados',
      variante,
    );
  }
}
