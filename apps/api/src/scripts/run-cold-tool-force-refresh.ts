import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { ColdToolDiscoveryService } from '../modules/analysis/cold-tool-discovery.service';

type CliOptions = {
  limit: number;
  batchSize: number;
  concurrency: number;
  onlyMatched: boolean;
  provider: string | null;
  model: string | null;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    limit: 400,
    batchSize: 4,
    concurrency: 3,
    onlyMatched: false,
    provider: null,
    model: 'gpt-5.4',
  };

  for (const arg of argv) {
    const normalized = String(arg ?? '').trim();
    if (!normalized.startsWith('--')) {
      continue;
    }

    const [flag, rawValue] = normalized.slice(2).split('=');
    const value = rawValue?.trim() ?? '';

    if (flag === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
    if (flag === 'batchSize') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.batchSize = parsed;
      }
    }
    if (flag === 'concurrency') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.concurrency = parsed;
      }
    }
    if (flag === 'onlyMatched') {
      options.onlyMatched = ['1', 'true', 'yes', 'on'].includes(
        value.toLowerCase(),
      );
    }
    if (flag === 'provider') {
      options.provider = value || null;
    }
    if (flag === 'model') {
      options.model = value || null;
    }
  }

  return options;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  if (!items.length) {
    return;
  }

  let cursor = 0;
  const runnerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: runnerCount }, async () => {
      while (cursor < items.length) {
        const currentIndex = cursor;
        cursor += 1;
        await worker(items[currentIndex]);
      }
    }),
  );
}

function chunkItems<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const coldToolDiscoveryService = app.get(ColdToolDiscoveryService);

    const rows = (await prisma.$queryRawUnsafe(
      `
        select ra."repositoryId"
        from "RepositoryAnalysis" ra
        where ra.tags @> ARRAY['cold_tool_evaluated']::text[]
          ${
            options.onlyMatched
              ? `and ra.tags @> ARRAY['cold_tool_pool']::text[]`
              : ''
          }
          ${
            options.provider
              ? `and coalesce(ra."analysisJson"->'coldToolPool'->>'provider','') = $2`
              : ''
          }
        order by ra."updatedAt" desc
        limit $1
      `,
      options.limit,
      ...(options.provider ? [options.provider] : []),
    )) as Array<{ repositoryId: string }>;

    const repositoryIds = rows
      .map((row) => row.repositoryId)
      .filter(Boolean);

    const batches = chunkItems(repositoryIds, options.batchSize);
    let refreshed = 0;
    let matched = 0;

    await runWithConcurrency(batches, options.concurrency, async (batch) => {
      const result = await coldToolDiscoveryService.analyzeRepositoriesBatch({
        repositoryIds: batch,
        batchSize: Math.min(options.batchSize, batch.length),
        persist: true,
        forceRefresh: true,
        modelOverride: options.model,
      });
      refreshed += result.processed;
      matched += result.matchedColdTools;
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          repositoryIds: repositoryIds.length,
          refreshed,
          matched,
          model: options.model,
          onlyMatched: options.onlyMatched,
          provider: options.provider,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await app.close();
  }
}

void main();
