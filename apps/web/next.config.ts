import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import { execSync } from 'node:child_process';
import path from 'node:path';

function resolveBuildGitSha() {
  const providerSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();

  if (providerSha) {
    return providerSha.slice(0, 7);
  }

  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

function resolveBuildEnvironment() {
  return (
    process.env.VERCEL_ENV?.trim() ??
    process.env.NODE_ENV?.trim() ??
    'development'
  );
}

function resolveBuildTime() {
  return process.env.BUILD_TIME_ISO?.trim() ?? new Date().toISOString();
}

const createNextConfig = (phase: string): NextConfig => ({
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Keep `next dev` isolated from `next build` so long-running local UI
  // sessions do not get their chunk graph corrupted by verification builds.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  env: {
    NEXT_PUBLIC_BUILD_GIT_SHA: resolveBuildGitSha(),
    NEXT_PUBLIC_BUILD_TIME: resolveBuildTime(),
    NEXT_PUBLIC_BUILD_ENVIRONMENT: resolveBuildEnvironment(),
  },
});

export default createNextConfig;
