import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { aBooleano, PaginacionDto } from '../../common/http.util';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;
const aMayusculas = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().toUpperCase()
    : value;

export class CrearProductoDto {
  /** CAMISETA, CHOMPA, CANILLERAS, GORRA, ACCESORIO… (lista abierta, se guarda en mayúsculas). */
  @Transform(aMayusculas)
  @Matches(/^[A-Z_]{3,40}$/, {
    message: 'categoria debe tener 3-40 letras mayúsculas o guion bajo',
  })
  categoria!: string;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  marca_equipo!: string;

  /** 'AAAA' (año) o 'AAAA-AA' (temporada que cruza dos años). */
  @IsOptional()
  @Transform(recortar)
  @Matches(/^\d{4}(-\d{2})?$/, {
    message: "temporada_coleccion debe tener formato 'AAAA' o 'AAAA-AA'",
  })
  temporada_coleccion?: string;
}

export class ActualizarProductoDto extends PartialType(CrearProductoDto) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class BuscarProductosDto extends PaginacionDto {
  @IsOptional()
  @Transform(aMayusculas)
  @IsString()
  categoria?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  marca_equipo?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(20)
  temporada?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  busqueda?: string;

  @IsOptional()
  @Transform(aBooleano)
  @IsBoolean()
  activo?: boolean;
}
