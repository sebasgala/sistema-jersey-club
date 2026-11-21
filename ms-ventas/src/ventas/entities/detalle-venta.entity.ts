import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { decimalTransformer } from '../../common/decimal.transformer';
import { Venta } from './venta.entity';

/**
 * Línea de venta con precio y costo congelados (Directriz 3): aunque la
 * variante cambie de costo en ms-inventario, la ganancia histórica no varía.
 */
@Entity({ name: 'detalle_ventas' })
export class DetalleVenta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'venta_id', type: 'uuid' })
  ventaId!: string;

  @ManyToOne(() => Venta, (venta) => venta.detalle)
  @JoinColumn({ name: 'venta_id' })
  venta?: Venta;

  /** UUID lógico de ms-inventario. Sin FK (Directriz 1). */
  @Column({ name: 'variante_id', type: 'uuid' })
  varianteId!: string;

  @Column({ name: 'snapshot_producto', type: 'jsonb' })
  snapshotProducto!: Record<string, unknown>;

  @Column({ type: 'int' })
  cantidad!: number;

  @Column({
    name: 'precio_venta_unitario',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  precioVentaUnitario!: string;

  @Column({
    name: 'valor_jersey_club_unitario',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  valorJerseyClubUnitario!: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  subtotal!: string;

  @Column({
    name: 'ganancia_linea',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  gananciaLinea!: string;
}
