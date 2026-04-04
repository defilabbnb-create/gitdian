import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { startRuntimeRefreshWatcher } from './common/runtime/runtime-refresh';

async function bootstrap() {
  process.env.ENABLE_QUEUE_WORKERS = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  const refreshWatcher = startRuntimeRefreshWatcher({
    serviceName: 'worker',
    onStale: async () => {
      await app.close();
    },
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', () => {
    refreshWatcher.stop();
  });
}

void bootstrap();
