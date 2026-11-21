import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Outbox transaccional: se escribe en la misma transacción que confirma la
 * venta (evento `VentaConfirmada`, con `vendedor_id` para comisiones en RRHH).
 * En el MVP no hay relay; `procesado` queda en false.
 */
@Entity({ name: 'outbox_eventos' })
export class OutboxEvento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'agregado_tipo', type: 'varchar', length: 50 })
  agregadoTipo!: string;

  @Column({ name: 'agregado_id', type: 'uuid' })
  agregadoId!: string;

  @Column({ name: 'tipo_evento', type: 'varchar', length: 80 })
  tipoEvento!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'boolean', default: false })
  procesado!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
