import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RepositoryCachedRankingService } from '../modules/analysis/repository-cached-ranking.service';

function readIntArg(name: string, fallback: number) {
  const match = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (!match) {
    return fallback;
  }

  const value = Number.parseInt(match.split('=')[1] ?? '', 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const service = app.get(RepositoryCachedRankingService);
    const result = await service.rebuildRankings({
      batchSize: readIntArg('batchSize', 200),
      limit: readIntArg('limit', 0) || undefined,
    });

    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await app.close();
  }
}

void main();
