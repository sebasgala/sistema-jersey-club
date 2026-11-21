import { OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { normalizarDinero, PATRON_DINERO } from '../../common/dinero.util';
import { aBooleano, PaginacionDto } from '../../common/http.util';

const aMayusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().toUpperCase()
    : value;
const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;
const MENSAJE_DINERO =
  "debe ser un monto con hasta 2 decimales, p. ej. '30.00'";

export class CrearVarianteDto {
  @IsUUID()
  producto_id!: string;

  @IsOptional()
  @Transform(aMayusculas)
  @Matches(/^[A-Z0-9_-]{2,30}$/, { message: 'codigo_legacy inválido' })
  codigo_legacy?: string;

  /** Se guarda en mayúsculas; 2XL se normaliza a XXL. */
  @Transform(({ value }: { value: unknown }) => {
    const v = aMayusculas({ value });
    return v === '2XL' ? 'XXL' : v;
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  talla_medida!: string;

  @Transform(aMayusculas)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  version_modelo!: string;

  @IsOptional()
  @Transform(aMayusculas)
  @IsString()
  @MaxLength(150)
  adicional_parche?: string;

  @IsOptional()
  @Transform(aMayusculas)
  @IsString()
  @MaxLength(100)
  adicional_dorsal?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  observaciones?: string;

  @IsOptional()
  @Transform(normalizarDinero)
  @Matches(PATRON_DINERO, { message: `valor_jersey_club ${MENSAJE_DINERO}` })
  valor_jersey_club?: string;

  @IsOptional()
  @Transform(normalizarDinero)
  @Matches(PATRON_DINERO, { message: `pvp_sugerido ${MENSAJE_DINERO}` })
  pvp_sugerido?: string;
}

/** Atributos editables. `stock_actual` nunca se edita (solo por movimientos); precios van por /precios. */
export class ActualizarVarianteDto extends PartialType(
  OmitType(CrearVarianteDto, [
    'producto_id',
    'valor_jersey_club',
    'pvp_sugerido',
  ] as const),
) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ActualizarPreciosDto {
  /** Costo de llegada (landed cost) entregado por contabilidad. */
  @IsOptional()
  @Transform(normalizarDinero)
  @Matches(PATRON_DINERO, { message: `valor_jersey_club ${MENSAJE_DINERO}` })
  valor_jersey_club?: string;

  @IsOptional()
  @Transform(normalizarDinero)
  @Matches(PATRON_DINERO, { message: `pvp_sugerido ${MENSAJE_DINERO}` })
  pvp_sugerido?: string;
}

export class BuscarVariantesDto extends PaginacionDto {
  @IsOptional()
  @IsUUID()
  producto_id?: string;

  @IsOptional()
  @Transform(aMayusculas)
  @IsString()
  categoria?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  marca_equipo?: string;

  /** Temporada exacta: '2024' o '2024-25'. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(20)
  temporada?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const v = aMayusculas({ value });
    return v === '2XL' ? 'XXL' : v;
  })
  @IsString()
  talla_medida?: string;

  @IsOptional()
  @Transform(aMayusculas)
  @IsString()
  version_modelo?: string;

  /** Coincidencia parcial. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(150)
  adicional_parche?: string;

  /** Coincidencia parcial (nombre o número). */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  adicional_dorsal?: string;

  @IsOptional()
  @Transform(aMayusculas)
  @IsString()
  codigo_legacy?: string;

  /** Texto libre: nombre, marca/equipo, temporada, código, parche, dorsal u observaciones. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  busqueda?: string;

  /** true: solo variantes con stock_actual > 0. */
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  solo_disponibles?: boolean;

  /** true: solo variantes con valor_jersey_club = 0 (costo pendiente). */
  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  sin_costo?: boolean;

  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activo?: boolean;
}
