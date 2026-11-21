import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginacionDto } from '../../common/http.util';
import {
  TIPOS_MOVIMIENTO,
  type TipoMovimiento,
} from '../entities/movimiento-stock.entity';

/** Longitud máxima de la Idempotency-Key en ms-inventario (se compone con ':' + UUID en VARCHAR(100)). */
export const MAX_IDEMPOTENCY_KEY = 48;

export class ItemDescuentoDto {
  @IsUUID()
  variante_id!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  cantidad!: number;
}

export class SolicitudDescuentoDto {
  /** Alternativa a la cabecera Idempotency-Key (la cabecera tiene prioridad). */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDEMPOTENCY_KEY)
  idempotency_key?: string;

  /** Id de la venta en ms-ventas. */
  @IsUUID()
  referencia_id!: string;

  @ValidateNested({ each: true })
  @Type(() => ItemDescuentoDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  items!: ItemDescuentoDto[];
}

export class SolicitudReversionDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDEMPOTENCY_KEY)
  idempotency_key?: string;

  @IsUUID()
  referencia_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}

export class SolicitudAjusteDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_IDEMPOTENCY_KEY)
  idempotency_key?: string;

  @IsUUID()
  variante_id!: string;

  @IsIn(['AJUSTE_ENTRADA', 'AJUSTE_SALIDA'])
  tipo!: 'AJUSTE_ENTRADA' | 'AJUSTE_SALIDA';

  @IsInt()
  @Min(1)
  @Max(10000)
  cantidad!: number;

  /** Motivo obligatorio: queda en el Kardex. */
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  observacion!: string;
}

export class BuscarMovimientosDto extends PaginacionDto {
  @IsOptional()
  @IsUUID()
  variante_id?: string;

  @IsOptional()
  @IsUUID()
  referencia_id?: string;

  @IsOptional()
  @IsIn(TIPOS_MOVIMIENTO)
  tipo?: TipoMovimiento;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
