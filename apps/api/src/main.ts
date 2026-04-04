import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AdminApiKeyGuard } from './common/auth/admin-api-key.guard';
import { INTERNAL_API_KEY_HEADER } from './common/auth/admin-api-key.constants';
import { startRuntimeRefreshWatcher } from './common/runtime/runtime-refresh';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const webOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: webOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', INTERNAL_API_KEY_HEADER],
  });
  app.useGlobalGuards(app.get(AdminApiKeyGuard));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  app.setGlobalPrefix('api');
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  const shutdown = async () => {
    await app.close();
  };

  const refreshWatcher = startRuntimeRefreshWatcher({
    serviceName: 'api',
    onStale: shutdown,
  });

  const terminate = async () => {
    refreshWatcher.stop();
    await shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void terminate();
  });
  process.on('SIGTERM', () => {
    void terminate();
  });
}

void bootstrap();
