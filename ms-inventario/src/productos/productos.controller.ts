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
  ActualizarProductoDto,
  BuscarProductosDto,
  CrearProductoDto,
} from './dto/producto.dto';
import { ProductosService } from './productos.service';

@ApiTags('productos')
@Controller('productos')
export class ProductosController {
  constructor(private readonly productos: ProductosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar productos con filtros' })
  async buscar(@Query() filtro: BuscarProductosDto) {
    return new Respuesta(
      'Productos encontrados',
      await this.productos.buscar(filtro),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener producto con sus variantes' })
  async obtener(@Param('id', new ParseUUIDPipe()) id: string) {
    return new Respuesta(
      'Producto encontrado',
      await this.productos.obtener(id),
    );
  }

  @Post()
  @ApiOperation({ summary: 'Crear producto' })
  async crear(
    @Body() dto: CrearProductoDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const producto = await this.productos.crear(dto);
    res.location(`/api/v1/productos/${producto.id}`);
    return new Respuesta('Producto creado', producto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar parcialmente un producto' })
  async actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ActualizarProductoDto,
  ) {
    return new Respuesta(
      'Producto actualizado',
      await this.productos.actualizar(id, dto),
    );
  }
}
