import { Logger } from '@nestjs/common';
import { execSync } from 'node:child_process';

type RuntimeRefreshWatcher = {
  stop: () => void;
};

function readBooleanEnv(value: string | undefined, fallback: boolean) {
  if (typeof value !== 'string') {
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

function readPositiveIntEnv(value: string | undefined, fallback: number) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readCurrentGitSha() {
  try {
    return execSync('git rev-parse --short=12 HEAD', {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

export function startRuntimeRefreshWatcher(args: {
  serviceName: string;
  onStale: () => Promise<void>;
}): RuntimeRefreshWatcher {
  const enabled = readBooleanEnv(
    process.env.ENABLE_RUNTIME_REFRESH_WATCHER,
    true,
  );
  if (!enabled) {
    return {
      stop() {},
    };
  }

  const runtimeGitSha = process.env.GITDIAN_GIT_SHA?.trim() || null;
  if (!runtimeGitSha) {
    return {
      stop() {},
    };
  }

  const logger = new Logger(`${args.serviceName}RuntimeRefreshWatcher`);
  const intervalMs = readPositiveIntEnv(
    process.env.RUNTIME_REFRESH_WATCH_INTERVAL_MS,
    30_000,
  );
  let refreshing = false;

  const timer = setInterval(() => {
    if (refreshing) {
      return;
    }

    const currentGitSha = readCurrentGitSha();
    if (!currentGitSha || currentGitSha === runtimeGitSha) {
      return;
    }

    refreshing = true;
    logger.warn(
      `Detected newer git SHA current=${currentGitSha} runtime=${runtimeGitSha}; exiting for launchd restart.`,
    );

    void args
      .onStale()
      .catch((error) => {
        logger.error(
          `Failed to refresh stale runtime: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      })
      .finally(() => {
        process.exit(0);
      });
  }, intervalMs);

  timer.unref?.();

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
