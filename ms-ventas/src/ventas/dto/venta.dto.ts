import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { normalizarDinero, PATRON_DINERO } from '../../common/dinero.util';
import { PaginacionDto } from '../../common/http.util';
import {
  ESTADOS_VENTA,
  type EstadoVenta,
  METODOS_PAGO,
  type MetodoPago,
} from '../entities/venta.entity';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;

export class ItemVentaDto {
  @IsUUID()
  variante_id!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  cantidad!: number;

  /** Precio de venta unitario acordado con el cliente, p. ej. '45.00'. */
  @Transform(normalizarDinero)
  @Matches(PATRON_DINERO, {
    message:
      "precio_venta_unitario debe ser un monto con hasta 2 decimales, p. ej. '45.00'",
  })
  precio_venta_unitario!: string;
}

/** Datos mínimos del cliente para vender aunque ms-clientes no responda (degradación). */
export class ClienteRespaldoDto {
  @IsIn(['CEDULA', 'RUC', 'PASAPORTE', 'CONSUMIDOR_FINAL'])
  tipo_identificacion!: string;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  identificacion!: string;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre_completo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  telefono?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ciudad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  direccion_referencia?: string;
}

export class CrearVentaDto {
  /** Si se omite, la venta es a consumidor final. */
  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClienteRespaldoDto)
  cliente_respaldo?: ClienteRespaldoDto;

  /** Reservado para comisiones en ms-rrhh (UUID lógico, sin validación cruzada). */
  @IsOptional()
  @IsUUID()
  vendedor_id?: string | null;

  @IsIn(METODOS_PAGO)
  metodo_pago!: MetodoPago;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  observacion?: string;

  @ValidateNested({ each: true })
  @Type(() => ItemVentaDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  items!: ItemVentaDto[];
}

export class BuscarVentasDto extends PaginacionDto {
  /** Fecha local de Ecuador, inclusive (AAAA-MM-DD). */
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener formato AAAA-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener formato AAAA-MM-DD' })
  hasta?: string;

  @IsOptional()
  @IsIn(ESTADOS_VENTA)
  estado?: EstadoVenta;

  @IsOptional()
  @IsIn(METODOS_PAGO)
  metodo_pago?: MetodoPago;

  @IsOptional()
  @IsUUID()
  cliente_id?: string;

  @IsOptional()
  @IsUUID()
  vendedor_id?: string;
}

export class DashboardDto {
  /** Por defecto: primer día del mes en curso (hora de Ecuador). */
  @IsOptional()
  @Matches(FECHA, { message: 'desde debe tener formato AAAA-MM-DD' })
  desde?: string;

  /** Por defecto: hoy (hora de Ecuador). */
  @IsOptional()
  @Matches(FECHA, { message: 'hasta debe tener formato AAAA-MM-DD' })
  hasta?: string;
}

export class AnularVentaDto {
  /** Motivo obligatorio: queda en la venta y en el evento VentaAnulada. */
  @Transform(recortar)
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  motivo!: string;
}
