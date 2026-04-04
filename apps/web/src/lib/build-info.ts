import { execSync } from 'node:child_process';

export type WebBuildInfo = {
  gitSha: string;
  buildTime: string;
  environment: string;
  worktreeDirty: boolean;
};

function readBuildValue(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function readRuntimeGitSha() {
  try {
    return execSync('git rev-parse --short=12 HEAD', {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function readRuntimeDirtyFlag() {
  try {
    const output = execSync('git status --porcelain', {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

export function getWebBuildInfo(): WebBuildInfo {
  const gitSha = readBuildValue(
    process.env.NEXT_PUBLIC_BUILD_GIT_SHA,
    readRuntimeGitSha(),
  );
  const buildTime = readBuildValue(
    process.env.NEXT_PUBLIC_BUILD_TIME,
    readBuildValue(process.env.GITDIAN_RUNTIME_BOOTED_AT, 'unknown build time'),
  );
  const environment = readBuildValue(
    process.env.NEXT_PUBLIC_BUILD_ENVIRONMENT,
    readBuildValue(process.env.NODE_ENV, 'unknown environment'),
  );
  const worktreeDirty =
    readBuildValue(process.env.NEXT_PUBLIC_BUILD_WORKTREE_DIRTY, '') === 'true' ||
    readBuildValue(process.env.GITDIAN_WORKTREE_DIRTY, '') === 'true' ||
    readRuntimeDirtyFlag();

  return {
    gitSha,
    buildTime,
    environment,
    worktreeDirty,
  };
}
