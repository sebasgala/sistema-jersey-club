import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Conexión TypeORM limitada al esquema propio del servicio (DB_SCHEMA).
 * `search_path` se fija solo a ese esquema: el servicio no ve tablas ajenas.
 * `synchronize` siempre en false: el esquema lo gobierna database/*.sql.
 */
export function opcionesTypeOrm(config: ConfigService): TypeOrmModuleOptions {
  const esquema = config.getOrThrow<string>('DB_SCHEMA');
  if (!/^ms_[a-z_]+$/.test(esquema)) {
    throw new Error(`DB_SCHEMA inválido: ${esquema}`);
  }
  return {
    type: 'postgres',
    host: config.getOrThrow<string>('DB_HOST'),
    port: Number(config.getOrThrow<string>('DB_PORT')),
    database: config.getOrThrow<string>('DB_NAME'),
    username: config.getOrThrow<string>('DB_USER'),
    password: config.getOrThrow<string>('DB_PASSWORD'),
    schema: esquema,
    autoLoadEntities: true,
    synchronize: false,
    migrationsRun: false,
    applicationName: config.get<string>('SERVICE_NAME', 'jersey-club'),
    extra: { options: `-c search_path=${esquema}` },
  };
}
