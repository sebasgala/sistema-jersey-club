import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ErrorNegocio } from '../common/errores.filter';
import { type Pagina, patronLike } from '../common/http.util';
import type {
  ActualizarClienteDto,
  BuscarClientesDto,
  CrearClienteDto,
} from './dto/cliente.dto';
import {
  Cliente,
  CONSUMIDOR_FINAL_ID,
  type TipoIdentificacion,
} from './entities/cliente.entity';
import {
  normalizarIdentificacion,
  validarIdentificacion,
} from './identificacion.validator';

export interface ClienteApi {
  id: string;
  tipo_identificacion: TipoIdentificacion;
  identificacion: string;
  nombre_completo: string;
  telefono: string | null;
  email: string | null;
  provincia: string | null;
  ciudad: string | null;
  direccion_referencia: string | null;
  courier_preferido: string;
  created_at: Date;
  updated_at: Date;
}

export function aClienteApi(c: Cliente): ClienteApi {
  return {
    id: c.id,
    tipo_identificacion: c.tipoIdentificacion,
    identificacion: c.identificacion,
    nombre_completo: c.nombreCompleto,
    telefono: c.telefono,
    email: c.email,
    provincia: c.provincia,
    ciudad: c.ciudad,
    direccion_referencia: c.direccionReferencia,
    courier_preferido: c.courierPreferido,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

@Injectable()
export class ClientesService {
  constructor(
    @InjectRepository(Cliente) private readonly repo: Repository<Cliente>,
  ) {}

  async buscar(filtro: BuscarClientesDto): Promise<Pagina<ClienteApi>> {
    const qb = this.repo.createQueryBuilder('c');
    if (filtro.busqueda) {
      const patron = patronLike(filtro.busqueda);
      const soloDigitos = filtro.busqueda.replace(/\D/g, '');
      qb.andWhere(
        `(c.nombre_completo ILIKE :patron OR c.identificacion ILIKE :patron
          OR c.telefono ILIKE :patron
          ${soloDigitos.length >= 4 ? "OR regexp_replace(COALESCE(c.telefono, ''), '\\D', '', 'g') LIKE :digitos" : ''})`,
        { patron, digitos: `%${soloDigitos}%` },
      );
    }
    if (filtro.tipo_identificacion) {
      qb.andWhere('c.tipo_identificacion = :tipo', {
        tipo: filtro.tipo_identificacion,
      });
    }
    if (filtro.ciudad) {
      qb.andWhere('c.ciudad ILIKE :ciudad', {
        ciudad: patronLike(filtro.ciudad),
      });
    }
    qb.orderBy('c.nombre_completo', 'ASC')
      .offset((filtro.page - 1) * filtro.limit)
      .limit(filtro.limit);
    const [clientes, total] = await qb.getManyAndCount();
    return {
      items: clientes.map(aClienteApi),
      meta: { page: filtro.page, limit: filtro.limit, total },
    };
  }

  async obtener(id: string): Promise<ClienteApi> {
    return aClienteApi(await this.cargar(id));
  }

  async obtenerPorIdentificacion(identificacion: string): Promise<ClienteApi> {
    const cliente = await this.repo.findOne({
      where: {
        identificacion: identificacion.replace(/[\s-]/g, '').toUpperCase(),
      },
    });
    if (!cliente) {
      throw new ErrorNegocio(404, 'CLIENTE_NO_ENCONTRADO', [
        `No existe un cliente con identificación ${identificacion}`,
      ]);
    }
    return aClienteApi(cliente);
  }

  async crear(dto: CrearClienteDto): Promise<ClienteApi> {
    const identificacion = this.validar(
      dto.tipo_identificacion,
      dto.identificacion,
    );
    await this.verificarDisponible(identificacion);
    const cliente = this.repo.create({
      tipoIdentificacion: dto.tipo_identificacion,
      identificacion,
      nombreCompleto: dto.nombre_completo.toUpperCase(),
      telefono: dto.telefono ?? null,
      email: dto.email ?? null,
      provincia: dto.provincia ?? null,
      ciudad: dto.ciudad ?? null,
      direccionReferencia: dto.direccion_referencia ?? null,
      courierPreferido: dto.courier_preferido ?? 'SERVIENTREGA',
    });
    return aClienteApi(await this.guardar(cliente));
  }

  async actualizar(id: string, dto: ActualizarClienteDto): Promise<ClienteApi> {
    if (id === CONSUMIDOR_FINAL_ID) {
      throw new ErrorNegocio(409, 'CONSUMIDOR_FINAL_INMUTABLE', [
        'El consumidor final no se puede modificar',
      ]);
    }
    const cliente = await this.cargar(id);

    if (
      dto.tipo_identificacion !== undefined ||
      dto.identificacion !== undefined
    ) {
      if (!dto.tipo_identificacion || !dto.identificacion) {
        throw new ErrorNegocio(400, 'IDENTIFICACION_INVALIDA', [
          'Para cambiar la identificación envíe tipo_identificacion e identificacion juntos',
        ]);
      }
      if (dto.tipo_identificacion === 'CONSUMIDOR_FINAL') {
        throw new ErrorNegocio(400, 'IDENTIFICACION_INVALIDA', [
          'Un cliente registrado no puede convertirse en consumidor final',
        ]);
      }
      const identificacion = this.validar(
        dto.tipo_identificacion,
        dto.identificacion,
      );
      if (identificacion !== cliente.identificacion) {
        await this.verificarDisponible(identificacion);
      }
      cliente.tipoIdentificacion = dto.tipo_identificacion;
      cliente.identificacion = identificacion;
    }
    if (dto.nombre_completo !== undefined) {
      cliente.nombreCompleto = dto.nombre_completo.toUpperCase();
    }
    // null explícito limpia el campo; undefined lo deja como está
    if (dto.telefono !== undefined) cliente.telefono = dto.telefono ?? null;
    if (dto.email !== undefined) cliente.email = dto.email ?? null;
    if (dto.provincia !== undefined) cliente.provincia = dto.provincia ?? null;
    if (dto.ciudad !== undefined) cliente.ciudad = dto.ciudad ?? null;
    if (dto.direccion_referencia !== undefined) {
      cliente.direccionReferencia = dto.direccion_referencia ?? null;
    }
    if (dto.courier_preferido) cliente.courierPreferido = dto.courier_preferido;
    return aClienteApi(await this.guardar(cliente));
  }

  private validar(tipo: TipoIdentificacion, valor: string): string {
    const identificacion = normalizarIdentificacion(tipo, valor);
    const error = validarIdentificacion(tipo, identificacion);
    if (error) throw new ErrorNegocio(400, 'IDENTIFICACION_INVALIDA', [error]);
    return identificacion;
  }

  private async verificarDisponible(identificacion: string): Promise<void> {
    if (await this.repo.exists({ where: { identificacion } })) {
      throw new ErrorNegocio(409, 'CLIENTE_DUPLICADO', [
        `La identificación ${identificacion} ya está registrada`,
      ]);
    }
  }

  private async cargar(id: string): Promise<Cliente> {
    const cliente = await this.repo.findOne({ where: { id } });
    if (!cliente) {
      throw new ErrorNegocio(404, 'CLIENTE_NO_ENCONTRADO', [
        `No existe el cliente ${id}`,
      ]);
    }
    return cliente;
  }

  /** Traduce la carrera de unicidad (23505) a CLIENTE_DUPLICADO. */
  private async guardar(cliente: Cliente): Promise<Cliente> {
    try {
      return await this.repo.save(cliente);
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e.driverError as { code?: string }).code === '23505'
      ) {
        throw new ErrorNegocio(409, 'CLIENTE_DUPLICADO', [
          `La identificación ${cliente.identificacion} ya está registrada`,
        ]);
      }
      throw e;
    }
  }
}
