import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { Producto } from '../../productos/entities/producto.entity';

/**
 * Variante exacta vendible: Producto + Talla/Medida + Versión/Modelo
 * + Adicional Parche + Adicional Dorsal (índice único ux_variantes_combinacion).
 * `stockActual` solo cambia mediante movimientos de stock (Directriz 2).
 */
@Entity({ name: 'variantes' })
export class Variante {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'producto_id', type: 'uuid' })
  productoId!: string;

  @ManyToOne(() => Producto, (producto) => producto.variantes)
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  @Column({
    name: 'codigo_legacy',
    type: 'varchar',
    length: 30,
    nullable: true,
    unique: true,
  })
  codigoLegacy!: string | null;

  @Column({ name: 'talla_medida', type: 'varchar', length: 20 })
  tallaMedida!: string;

  @Column({ name: 'version_modelo', type: 'varchar', length: 30 })
  versionModelo!: string;

  @Column({
    name: 'adicional_parche',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  adicionalParche!: string | null;

  @Column({
    name: 'adicional_dorsal',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  adicionalDorsal!: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones!: string | null;

  @Column({ name: 'stock_actual', type: 'int', default: 0 })
  stockActual!: number;

  /** Costo de llegada (landed cost) entregado por contabilidad. */
  @Column({
    name: 'valor_jersey_club',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  valorJerseyClub!: string;

  @Column({
    name: 'pvp_sugerido',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: decimalTransformer,
  })
  pvpSugerido!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
