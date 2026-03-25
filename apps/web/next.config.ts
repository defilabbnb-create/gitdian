import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import path from 'node:path';

const createNextConfig = (phase: string): NextConfig => ({
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Keep `next dev` isolated from `next build` so long-running local UI
  // sessions do not get their chunk graph corrupted by verification builds.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});

export default createNextConfig;
