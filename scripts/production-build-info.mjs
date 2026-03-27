#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { chromium } from 'playwright';

export const DEFAULT_BASE_URL = 'https://local3000.luckytad.vip/';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_POLL_INTERVAL_MS = 1_000;

export function parseBuildInfoArgs(argv) {
  const options = {
    baseUrl: process.env.GITDIAN_VERIFY_BASE_URL ?? DEFAULT_BASE_URL,
    timeoutMs: Number(process.env.GITDIAN_VERIFY_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
    json: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
      continue;
    }

    if (arg.startsWith('--timeout-ms=')) {
      const timeoutMs = Number(arg.slice('--timeout-ms='.length));
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        options.timeoutMs = timeoutMs;
      }
      continue;
    }

    if (arg === '--json') {
      options.json = true;
    }
  }

  return options;
}

export function getLocalHeadShortSha() {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
}

function normalizeText(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseBuildInfo(lines) {
  const gitShaLine = lines.find((line) => line.startsWith('Git SHA:'));
  const environmentLine = lines.find((line) => line.startsWith('Environment:'));
  const buildTimeLine = lines.find((line) => line.startsWith('Build Time:'));

  return {
    gitSha: gitShaLine?.slice('Git SHA:'.length).trim() ?? '',
    environment: environmentLine?.slice('Environment:'.length).trim() ?? '',
    buildTime: buildTimeLine?.slice('Build Time:'.length).trim() ?? '',
  };
}

export async function fetchRemoteBuildInfo(baseUrl) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const settingsUrl = new URL('/settings', baseUrl).toString();
    await page.goto(settingsUrl, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });

    const text = await page.locator('main').innerText();
    const lines = normalizeText(text);
    return {
      settingsUrl,
      ...parseBuildInfo(lines),
    };
  } finally {
    await browser.close();
  }
}

export async function waitForRemoteBuildInfoMatch({
  baseUrl,
  expectedSha,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
}) {
  const startedAt = Date.now();
  let lastRemoteBuildInfo = null;
  let lastError = null;

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const remoteBuildInfo = await fetchRemoteBuildInfo(baseUrl);
      lastRemoteBuildInfo = remoteBuildInfo;
      lastError = null;

      if (
        remoteBuildInfo.gitSha &&
        remoteBuildInfo.environment &&
        remoteBuildInfo.buildTime &&
        remoteBuildInfo.gitSha === expectedSha
      ) {
        return {
          ok: true,
          localHead: expectedSha,
          remoteBuildInfo,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    ok: false,
    localHead: expectedSha,
    remoteBuildInfo: lastRemoteBuildInfo,
    lastError,
  };
}

export function formatBuildInfoSummary({
  localHead,
  remoteBuildInfo,
  lastError,
}) {
  return [
    `Local HEAD: ${localHead}`,
    `Remote Git SHA: ${remoteBuildInfo?.gitSha || 'unavailable'}`,
    `Remote Environment: ${remoteBuildInfo?.environment || 'unavailable'}`,
    `Remote Build Time: ${remoteBuildInfo?.buildTime || 'unavailable'}`,
    ...(lastError ? [`Last fetch error: ${lastError}`] : []),
  ].join('\n');
}
