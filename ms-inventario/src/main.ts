import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { correlationIdMiddleware } from './common/correlation-id.middleware';
import { ErroresFilter } from './common/errores.filter';
import { RespuestaInterceptor } from './common/respuesta.interceptor';

const SERVICIO = {
  nombre: 'ms-inventario',
  puerto: 3011,
  descripcion: 'Catálogo, variantes, stock en tiempo real y Kardex',
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      prefix: SERVICIO.nombre,
      json: process.env.LOG_JSON === 'true',
    }),
  });

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (
      process.env.CORS_ORIGINS ?? 'http://localhost:3014,http://localhost:3010'
    )
      .split(',')
      .map((o) => o.trim()),
    exposedHeaders: ['X-Correlation-Id', 'Idempotent-Replayed', 'Location'],
  });
  app.use(correlationIdMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ErroresFilter());
  app.useGlobalInterceptors(new RespuestaInterceptor());
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle(`Jersey Club — ${SERVICIO.nombre}`)
    .setDescription(
      `${SERVICIO.descripcion}. Contrato fuente: contracts/${SERVICIO.nombre}.openapi.yaml`,
    )
    .setVersion('1.0.0')
    .addServer(`http://localhost:${SERVICIO.puerto}`)
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swagger),
  );

  const puerto = Number(process.env.PORT ?? SERVICIO.puerto);
  await app.listen(puerto);
}

void bootstrap();
