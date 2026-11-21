import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginacionDto } from '../../common/http.util';
import {
  COURIERS,
  TIPOS_IDENTIFICACION,
  type Courier,
  type TipoIdentificacion,
} from '../entities/cliente.entity';

const recortar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : value;

/**
 * La validación ecuatoriana completa (módulo 10, RUC 001, etc.) depende del
 * tipo y se hace en ClientesService, que responde IDENTIFICACION_INVALIDA.
 */
export class CrearClienteDto {
  @IsIn(TIPOS_IDENTIFICACION)
  tipo_identificacion!: TipoIdentificacion;

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
  @Transform(recortar)
  @Matches(/^\+?[0-9 ()-]{7,20}$/, {
    message:
      'telefono debe tener entre 7 y 20 dígitos (se permiten +, espacios, paréntesis y guiones)',
  })
  telefono?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(80)
  provincia?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(80)
  ciudad?: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(500)
  direccion_referencia?: string;

  @IsOptional()
  @IsIn(COURIERS)
  courier_preferido?: Courier;
}

/** Cambiar la identificación exige enviar tipo y número juntos. */
export class ActualizarClienteDto extends PartialType(CrearClienteDto) {}

export class BuscarClientesDto extends PaginacionDto {
  /** Búsqueda rápida por nombre, identificación (cédula/RUC/pasaporte) o teléfono. */
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100)
  busqueda?: string;

  @IsOptional()
  @IsIn(TIPOS_IDENTIFICACION)
  tipo_identificacion?: TipoIdentificacion;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(80)
  ciudad?: string;
}
