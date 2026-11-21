import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Variante } from '../../variantes/entities/variante.entity';

export const TIPOS_MOVIMIENTO = [
  'SALDO_INICIAL',
  'VENTA',
  'REVERSION_VENTA',
  'AJUSTE_ENTRADA',
  'AJUSTE_SALIDA',
] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

/** Kardex: cada cambio de stock deja una fila inmutable. */
@Entity({ name: 'movimientos_stock' })
export class MovimientoStock {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'variante_id', type: 'uuid' })
  varianteId!: string;

  @ManyToOne(() => Variante)
  @JoinColumn({ name: 'variante_id' })
  variante?: Variante;

  @Column({ type: 'varchar', length: 25 })
  tipo!: TipoMovimiento;

  /** Siempre positiva; el sentido lo da `tipo`. */
  @Column({ type: 'int' })
  cantidad!: number;

  @Column({ name: 'stock_anterior', type: 'int' })
  stockAnterior!: number;

  @Column({ name: 'stock_nuevo', type: 'int' })
  stockNuevo!: number;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 100,
    nullable: true,
    unique: true,
  })
  idempotencyKey!: string | null;

  /** UUID lógico del documento origen (p. ej. la venta en ms-ventas). Sin FK. */
  @Column({ name: 'referencia_id', type: 'uuid', nullable: true })
  referenciaId!: string | null;

  @Column({ type: 'text', nullable: true })
  observacion!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
