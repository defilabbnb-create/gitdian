import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma/prisma.service';
import { QueueService } from '../modules/queue/queue.service';
import { RunAnalysisDto } from '../modules/analysis/dto/run-analysis.dto';

type RescreenState = 'pending' | 'skipped';

type CliOptions = {
  state: RescreenState;
  limit: number;
  batchSize: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    state: 'pending',
    limit: 500,
    batchSize: 50,
  };

  for (const arg of argv) {
    const normalized = String(arg ?? '').trim();
    if (!normalized.startsWith('--')) {
      continue;
    }

    const [flag, rawValue] = normalized.slice(2).split('=');
    const value = rawValue?.trim() ?? '';

    if (flag === 'state' && (value === 'pending' || value === 'skipped')) {
      options.state = value;
    }
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
  }

  return options;
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
    const queueService = app.get(QueueService);

    const condition =
      options.state === 'skipped'
        ? `
            (
              (ra."ideaSnapshotJson"->>'isPromising') = 'false'
              or (ra."ideaSnapshotJson"->>'nextAction') = 'SKIP'
              or (ra."insightJson"->>'oneLinerStrength') = 'WEAK'
            )
          `
        : `
            not (
              (ra."ideaSnapshotJson"->>'isPromising') = 'false'
              or (ra."ideaSnapshotJson"->>'nextAction') = 'SKIP'
              or (ra."insightJson"->>'oneLinerStrength') = 'WEAK'
            )
          `;

    const rows = (await prisma.$queryRawUnsafe(
      `
        with queued as (
          select distinct payload->>'repositoryId' as repository_id
          from "JobLog"
          where "queueName" in ('analysis.single', 'analysis.single.cold')
            and "jobStatus" in ('PENDING', 'RUNNING')
            and (
              "triggeredBy" = 'cold_tool_collector'
              or "triggeredBy" = 'analysis_single_watchdog'
              or "payload"->'dto'->>'analysisLane' = 'cold_tool'
              or coalesce(("payload"->>'fromColdToolCollector')::boolean, false) = true
            )
        )
        select ra."repositoryId"
        from "RepositoryAnalysis" ra
        where ra.tags @> ARRAY['cold_tool_pool']::text[]
          and not (
            ra."completenessJson" is not null
            and ra."ideaFitJson" is not null
            and ra."extractedIdeaJson" is not null
            and ra."insightJson" is not null
          )
          and ${condition}
          and ra."repositoryId" not in (
            select repository_id from queued where repository_id is not null
          )
        order by ra."updatedAt" asc
        limit $1
      `,
      options.limit,
    )) as Array<{ repositoryId: string }>;

    const repositoryIds = rows
      .map((row) => String(row.repositoryId ?? '').trim())
      .filter(Boolean);
    const batches = chunkItems(repositoryIds, options.batchSize);
    let enqueued = 0;

    for (const batch of batches) {
      const results = await queueService.enqueueSingleAnalysesBulk(
        batch.map((repositoryId) => ({
          repositoryId,
          dto: {
            runFastFilter: false,
            runCompleteness: true,
            runIdeaFit: true,
            runIdeaExtract: true,
            forceRerun: options.state === 'skipped',
            useDeepBundle: true,
            analysisLane: 'cold_tool',
          } satisfies RunAnalysisDto,
          triggeredBy: `cold_tool_${options.state}_rescreen`,
          metadata: {
            fromColdToolCollector: true,
            coldToolDeepRescreenState: options.state,
            rescreenTriggeredAt: new Date().toISOString(),
          },
          jobOptionsOverride: {
            priority: 16,
          },
        })),
        `cold_tool_${options.state}_rescreen`,
      );

      enqueued += results.filter((result) => result.jobStatus === 'PENDING').length;
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          state: options.state,
          selected: repositoryIds.length,
          enqueued,
          batchSize: options.batchSize,
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
