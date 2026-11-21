import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Variante } from '../../variantes/entities/variante.entity';

/** Categorías iniciales; la columna es abierta (VARCHAR) para crecer sin migrar. */
export const CATEGORIAS = [
  'CAMISETA',
  'CHOMPA',
  'CANILLERAS',
  'GORRA',
  'ACCESORIO',
] as const;

@Entity({ name: 'productos' })
export class Producto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40 })
  categoria!: string;

  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ name: 'marca_equipo', type: 'varchar', length: 100 })
  marcaEquipo!: string;

  @Column({
    name: 'temporada_coleccion',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  temporadaColeccion!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Variante, (variante) => variante.producto)
  variantes?: Variante[];
}
