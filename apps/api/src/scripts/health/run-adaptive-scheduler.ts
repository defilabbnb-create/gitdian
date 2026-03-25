import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { AdaptiveSchedulerService } from '../../modules/scheduler/adaptive-scheduler.service';

type SchedulerCliOptions = {
  apply: boolean;
  json: boolean;
  pretty: boolean;
};

function parseBoolean(value: string | undefined, fallback = true) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseArgs(argv: string[]): SchedulerCliOptions {
  const options: SchedulerCliOptions = {
    apply: false,
    json: false,
    pretty: true,
  };

  for (const rawArg of argv) {
    const arg = String(rawArg ?? '').trim();
    if (!arg.startsWith('--')) {
      continue;
    }

    const [flag, ...rest] = arg.slice(2).split('=');
    const value = rest.join('=').trim();

    if (flag === 'apply') {
      options.apply = parseBoolean(value);
    }
    if (flag === 'json') {
      options.json = parseBoolean(value);
    }
    if (flag === 'pretty') {
      options.pretty = parseBoolean(value);
    }
  }

  return options;
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));
  process.env.ENABLE_QUEUE_WORKERS = 'false';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const schedulerService = app.get(AdaptiveSchedulerService);
    const result = await schedulerService.evaluate({
      apply: options.apply,
    });

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`,
      );
      return;
    }

    process.stdout.write(`${result.explanation.summary}\n`);
    for (const line of result.explanation.bullets) {
      process.stdout.write(`- ${line}\n`);
    }
    process.stdout.write(
      `\n模式：${result.decision.currentMode} (${options.apply ? 'apply' : 'dry-run'})\n`,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void bootstrap();
}
