#!/usr/bin/env node

import process from 'node:process';
import {
  formatBuildInfoSummary,
  getLocalHeadShortSha,
  parseBuildInfoArgs,
  waitForRemoteBuildInfoMatch,
} from './production-build-info.mjs';

async function main() {
  const options = parseBuildInfoArgs(process.argv.slice(2));
  const localHead = getLocalHeadShortSha();

  const result = await waitForRemoteBuildInfoMatch({
    baseUrl: options.baseUrl,
    expectedSha: localHead,
    timeoutMs: options.timeoutMs,
  });

  const payload = {
    ok: result.ok,
    localHead,
    remoteGitSha: result.remoteBuildInfo?.gitSha || '',
    remoteEnvironment: result.remoteBuildInfo?.environment || '',
    remoteBuildTime: result.remoteBuildInfo?.buildTime || '',
    settingsUrl: result.remoteBuildInfo?.settingsUrl || new URL('/settings', options.baseUrl).toString(),
    lastError: result.lastError || '',
  };

  if (options.json) {
    console.log(JSON.stringify(payload));
  } else {
    console.log('Production build info check');
    console.log(`Settings URL: ${payload.settingsUrl}`);
    console.log(formatBuildInfoSummary({
      localHead,
      remoteBuildInfo: result.remoteBuildInfo,
      lastError: result.lastError,
    }));
    console.log(`Result: ${result.ok ? 'PASS' : 'FAIL'}`);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Production build info check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
