import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const TIPOS_IDENTIFICACION = [
  'CEDULA',
  'RUC',
  'PASAPORTE',
  'CONSUMIDOR_FINAL',
] as const;
export type TipoIdentificacion = (typeof TIPOS_IDENTIFICACION)[number];

export const COURIERS = [
  'SERVIENTREGA',
  'LAAR_COURIER',
  'ENTREGA_QUITO',
  'OTRO',
] as const;
export type Courier = (typeof COURIERS)[number];

/** Id fijo del consumidor final precargado (ver contracts/ms-clientes.openapi.yaml). */
export const CONSUMIDOR_FINAL_ID = '00000000-0000-4000-8000-000000000001';
export const CONSUMIDOR_FINAL_IDENTIFICACION = '9999999999999';

@Entity({ name: 'clientes' })
export class Cliente {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tipo_identificacion', type: 'varchar', length: 20 })
  tipoIdentificacion!: TipoIdentificacion;

  @Column({ type: 'varchar', length: 20, unique: true })
  identificacion!: string;

  @Column({ name: 'nombre_completo', type: 'varchar', length: 150 })
  nombreCompleto!: string;

  @Column({ type: 'varchar', length: 25, nullable: true })
  telefono!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  provincia!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ciudad!: string | null;

  @Column({ name: 'direccion_referencia', type: 'text', nullable: true })
  direccionReferencia!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email!: string | null;

  @Column({
    name: 'courier_preferido',
    type: 'varchar',
    length: 30,
    default: 'SERVIENTREGA',
  })
  courierPreferido!: Courier;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
