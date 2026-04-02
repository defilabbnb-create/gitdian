import type { NextConfig } from 'next';
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

const WEB_ROOT = path.join(__dirname);
const SHARED_VENDOR_ENTRY = path.join(
  WEB_ROOT,
  'vendor/shared/dist/index.js',
);

const createNextConfig = (): NextConfig => ({
  reactStrictMode: true,
  // Force Next 15 to keep both tracing and Turbopack rooted at apps/web so it
  // does not accidentally watch the whole home directory or monorepo.
  outputFileTracingRoot: WEB_ROOT,
  turbopack: {
    root: WEB_ROOT,
    resolveAlias: {
      shared: SHARED_VENDOR_ENTRY,
    },
  },
  experimental: {
    webpackBuildWorker: false,
  },
  webpack(config) {
    config.resolve ??= {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      shared: SHARED_VENDOR_ENTRY,
    };

    return config;
  },
  env: {
    NEXT_PUBLIC_BUILD_GIT_SHA: resolveBuildGitSha(),
    NEXT_PUBLIC_BUILD_TIME: resolveBuildTime(),
    NEXT_PUBLIC_BUILD_ENVIRONMENT: resolveBuildEnvironment(),
  },
});

export default createNextConfig;
