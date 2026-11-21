import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { DetalleVenta } from './detalle-venta.entity';

export const METODOS_PAGO = ['TRANSFERENCIA', 'EFECTIVO', 'TARJETA'] as const;
export type MetodoPago = (typeof METODOS_PAGO)[number];

export const ESTADOS_VENTA = [
  'PENDIENTE',
  'CONFIRMADA',
  'RECHAZADA',
  'FALLIDA',
] as const;
export type EstadoVenta = (typeof ESTADOS_VENTA)[number];

@Entity({ name: 'ventas' })
export class Venta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'numero_comprobante',
    type: 'varchar',
    length: 30,
    unique: true,
  })
  numeroComprobante!: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 100,
    nullable: true,
    unique: true,
  })
  idempotencyKey!: string | null;

  /** UUID lógico de ms-clientes. Sin FK (Directriz 1). */
  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId!: string;

  @Column({ name: 'cliente_snapshot', type: 'jsonb' })
  clienteSnapshot!: Record<string, unknown>;

  /** UUID lógico del futuro ms-rrhh, para comisiones. */
  @Column({ name: 'vendedor_id', type: 'uuid', nullable: true })
  vendedorId!: string | null;

  @Column({ name: 'metodo_pago', type: 'varchar', length: 20 })
  metodoPago!: MetodoPago;

  @Column({ type: 'varchar', length: 20, default: 'CONFIRMADA' })
  estado!: EstadoVenta;

  @Column({
    name: 'total_vendido',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  totalVendido!: string;

  @Column({
    name: 'costo_total_jrs',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  costoTotalJrs!: string;

  @Column({
    name: 'ganancia_total',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  gananciaTotal!: string;

  @Column({ type: 'text', nullable: true })
  observacion!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => DetalleVenta, (detalle) => detalle.venta, {
    cascade: ['insert'],
  })
  detalle?: DetalleVenta[];
}
