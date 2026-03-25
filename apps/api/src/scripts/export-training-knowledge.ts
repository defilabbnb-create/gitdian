import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TrainingKnowledgeExportService } from '../modules/analysis/training-knowledge-export.service';

type CliOptions = {
  sampleSize?: number;
  outputDir?: string;
  includeFullNames?: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};

  for (const rawArg of argv) {
    const arg = String(rawArg ?? '').trim();
    if (!arg.startsWith('--')) {
      continue;
    }

    const [flag, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=').trim();

    if (flag === 'sampleSize') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        options.sampleSize = parsed;
      }
    }

    if (flag === 'outputDir' && value) {
      options.outputDir = value;
    }

    if (flag === 'includeFullNames' && value) {
      options.includeFullNames = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return options;
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const exporter = app.get(TrainingKnowledgeExportService);
    const result = await exporter.exportKnowledgeAssets(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

void bootstrap();
