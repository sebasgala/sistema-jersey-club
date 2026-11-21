import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { exigirIdempotencyKey } from '../common/http.util';
import { Respuesta } from '../common/respuesta.interceptor';
import {
  BuscarMovimientosDto,
  MAX_IDEMPOTENCY_KEY,
  SolicitudAjusteDto,
  SolicitudDescuentoDto,
  SolicitudReversionDto,
} from './dto/stock.dto';
import { type ConReplay, StockService } from './stock.service';

const CABECERA_IDEMPOTENCIA = {
  name: 'Idempotency-Key',
  required: true,
  description: `8 a ${MAX_IDEMPOTENCY_KEY} caracteres. También se acepta en el cuerpo como idempotency_key.`,
};

@ApiTags('stock')
@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Post('descuentos')
  @ApiHeader(CABECERA_IDEMPOTENCIA)
  @ApiOperation({
    summary: 'Descontar stock de forma atómica (usado por ms-ventas)',
    description:
      'Todo o nada: si alguna variante no alcanza responde 409 STOCK_INSUFICIENTE y no mueve stock. Repetir la misma clave devuelve 200 con el resultado original.',
  })
  async descontar(
    @Headers('idempotency-key') cabecera: string | undefined,
    @Body() dto: SolicitudDescuentoDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const clave = exigirIdempotencyKey(
      cabecera ?? dto.idempotency_key,
      MAX_IDEMPOTENCY_KEY,
    );
    return this.responder(
      res,
      await this.stock.descontar(clave, dto),
      'Stock descontado',
    );
  }

  @Post('reversiones')
  @ApiHeader(CABECERA_IDEMPOTENCIA)
  @ApiOperation({
    summary: 'Revertir el descuento de una venta (compensación de la saga)',
    description:
      'Idempotente por referencia: si ya estaba revertido responde 200 sin mover stock.',
  })
  async revertir(
    @Headers('idempotency-key') cabecera: string | undefined,
    @Body() dto: SolicitudReversionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const clave = exigirIdempotencyKey(
      cabecera ?? dto.idempotency_key,
      MAX_IDEMPOTENCY_KEY,
    );
    return this.responder(
      res,
      await this.stock.revertir(clave, dto),
      'Stock revertido',
    );
  }

  @Post('ajustes')
  @ApiHeader(CABECERA_IDEMPOTENCIA)
  @ApiOperation({
    summary: 'Entrada de mercadería o ajuste manual de inventario',
  })
  async ajustar(
    @Headers('idempotency-key') cabecera: string | undefined,
    @Body() dto: SolicitudAjusteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const clave = exigirIdempotencyKey(
      cabecera ?? dto.idempotency_key,
      MAX_IDEMPOTENCY_KEY,
    );
    return this.responder(
      res,
      await this.stock.ajustar(clave, dto),
      'Ajuste registrado',
    );
  }

  @Get('movimientos')
  @ApiOperation({ summary: 'Consultar el Kardex' })
  async movimientos(@Query() filtro: BuscarMovimientosDto) {
    return new Respuesta(
      'Movimientos encontrados',
      await this.stock.listarMovimientos(filtro),
    );
  }

  private responder<T>(
    res: Response,
    r: ConReplay<T>,
    mensaje: string,
  ): Respuesta<T> {
    if (r.replay) {
      res.status(200);
      res.setHeader('Idempotent-Replayed', 'true');
      return new Respuesta(`${mensaje} (repetición idempotente)`, r.resultado);
    }
    res.status(201);
    return new Respuesta(mensaje, r.resultado);
  }
}
