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
import { ClientesService } from './clientes.service';
import {
  ActualizarClienteDto,
  BuscarClientesDto,
  CrearClienteDto,
} from './dto/cliente.dto';

@ApiTags('clientes')
@Controller('clientes')
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @ApiOperation({
    summary: 'Búsqueda rápida por nombre, identificación o teléfono',
  })
  async buscar(@Query() filtro: BuscarClientesDto) {
    return new Respuesta(
      'Clientes encontrados',
      await this.clientes.buscar(filtro),
    );
  }

  @Get('identificacion/:identificacion')
  @ApiOperation({ summary: 'Obtener cliente por cédula, RUC o pasaporte' })
  async obtenerPorIdentificacion(
    @Param('identificacion') identificacion: string,
  ) {
    return new Respuesta(
      'Cliente encontrado',
      await this.clientes.obtenerPorIdentificacion(identificacion),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Obtener cliente (usado por ms-ventas para el snapshot)',
  })
  async obtener(@Param('id', new ParseUUIDPipe()) id: string) {
    return new Respuesta('Cliente encontrado', await this.clientes.obtener(id));
  }

  @Post()
  @ApiOperation({ summary: 'Registrar cliente con validación ecuatoriana' })
  async crear(
    @Body() dto: CrearClienteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cliente = await this.clientes.crear(dto);
    res.location(`/api/v1/clientes/${cliente.id}`);
    return new Respuesta('Cliente registrado', cliente);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar datos de contacto, despacho o identificación',
  })
  async actualizar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ActualizarClienteDto,
  ) {
    return new Respuesta(
      'Cliente actualizado',
      await this.clientes.actualizar(id, dto),
    );
  }
}
