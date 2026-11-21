import { ConsoleLogger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { correlationIdMiddleware } from './common/correlation-id.middleware';
import { ErroresFilter } from './common/errores.filter';
import { RespuestaInterceptor } from './common/respuesta.interceptor';

const PUERTO = 3010;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({
      prefix: 'gateway',
      json: process.env.LOG_JSON === 'true',
    }),
  });

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3014')
      .split(',')
      .map((o) => o.trim()),
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Correlation-Id',
    ],
    exposedHeaders: ['X-Correlation-Id', 'Idempotent-Replayed', 'Location'],
  });
  // El gateway genera el X-Correlation-Id si no llega y lo propaga a los servicios.
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
    .setTitle('Jersey Club — gateway')
    .setDescription(
      'Punto único de entrada. Todas las rutas /api/v1/* exigen JWT salvo /auth/login y /salud. ' +
        'Los recursos se enrutan así: productos, variantes, stock → ms-inventario; ventas → ms-ventas; clientes → ms-clientes. ' +
        'Contratos completos en contracts/*.openapi.yaml.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .addServer(`http://localhost:${PUERTO}`)
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swagger),
  );

  await app.listen(Number(process.env.PORT ?? PUERTO));
}

void bootstrap();
