import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CorrelationId, exigirIdempotencyKey } from '../common/http.util';
import { Respuesta } from '../common/respuesta.interceptor';
import { BuscarVentasDto, CrearVentaDto, DashboardDto } from './dto/venta.dto';
import { VentasService } from './ventas.service';

@ApiTags('ventas')
@Controller('ventas')
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: '8 a 100 caracteres, uno por intento de cierre',
  })
  @ApiOperation({
    summary: 'Cerrar una venta en un solo clic',
    description:
      'Descuenta stock en ms-inventario, congela costo y precio, registra el pago y el evento VentaConfirmada. 409 STOCK_INSUFICIENTE si no alcanza el stock.',
  })
  async crear(
    @Headers('idempotency-key') cabecera: string | undefined,
    @Body() dto: CrearVentaDto,
    @CorrelationId() correlationId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const clave = exigirIdempotencyKey(cabecera, 100);
    const { replay, venta, advertencias } = await this.ventas.crear(
      clave,
      dto,
      correlationId,
    );
    res.location(`/api/v1/ventas/${venta.id}`);
    if (replay) {
      res.status(200).setHeader('Idempotent-Replayed', 'true');
      return new Respuesta('Venta confirmada (repetición idempotente)', venta);
    }
    res.status(201);
    return new Respuesta(
      advertencias.length
        ? `Venta confirmada. Atención: ${advertencias.join('; ')}`
        : 'Venta confirmada',
      venta,
    );
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'KPIs del dashboard ejecutivo',
    description:
      'Ventas, costo JRS, ganancia neta, margen, ticket promedio, ingresos por método de pago y top 5 productos. Solo ventas CONFIRMADA.',
  })
  async dashboard(@Query() filtro: DashboardDto) {
    return new Respuesta(
      'Dashboard de ventas',
      await this.ventas.dashboard(filtro),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Historial de ventas con filtros' })
  async buscar(@Query() filtro: BuscarVentasDto) {
    return new Respuesta(
      'Ventas encontradas',
      await this.ventas.buscar(filtro),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener venta con su detalle' })
  async obtener(@Param('id', new ParseUUIDPipe()) id: string) {
    return new Respuesta('Venta encontrada', await this.ventas.obtener(id));
  }
}
