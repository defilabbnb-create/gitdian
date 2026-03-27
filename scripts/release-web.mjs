#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import {
  formatBuildInfoSummary,
  getLocalHeadShortSha,
  parseBuildInfoArgs,
  waitForRemoteBuildInfoMatch,
} from './production-build-info.mjs';

function runCommand(label, command, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

async function main() {
  const options = parseBuildInfoArgs(process.argv.slice(2));
  const localHead = getLocalHeadShortSha();
  let remoteBuildInfo = null;
  let verifyResult = 'not-run';
  let success = false;

  try {
    runCommand('Building web', 'pnpm', ['--filter', 'web', 'build']);
    runCommand(
      'Restarting production web service',
      'launchctl',
      ['kickstart', '-k', 'gui/501/com.gitdian.web'],
    );

    console.log('\n==> Checking remote build info');
    const shaCheck = await waitForRemoteBuildInfoMatch({
      baseUrl: options.baseUrl,
      expectedSha: localHead,
      timeoutMs: options.timeoutMs,
    });
    remoteBuildInfo = shaCheck.remoteBuildInfo;

    if (!shaCheck.ok) {
      throw new Error(
        `Remote Git SHA did not match local HEAD within ${options.timeoutMs}ms.\n${formatBuildInfoSummary({
          localHead,
          remoteBuildInfo,
          lastError: shaCheck.lastError,
        })}`,
      );
    }

    console.log(formatBuildInfoSummary({
      localHead,
      remoteBuildInfo,
    }));

    runCommand('Running production acceptance checks', 'pnpm', ['verify:production']);
    verifyResult = 'passed';
    success = true;
  } catch (error) {
    verifyResult = verifyResult === 'passed' ? verifyResult : 'failed-or-not-run';
    console.error(`\nRelease pipeline failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    console.log('\nRelease summary');
    console.log(`Local HEAD: ${localHead}`);
    console.log(`Checked URL: ${remoteBuildInfo?.settingsUrl || new URL('/settings', options.baseUrl).toString()}`);
    console.log(`Fetched /settings raw Git SHA: ${remoteBuildInfo?.gitSha || 'unavailable'}`);
    console.log(`Fetched /settings raw Build Time: ${remoteBuildInfo?.buildTime || 'unavailable'}`);
    console.log(`Remote Git SHA: ${remoteBuildInfo?.gitSha || 'unavailable'}`);
    console.log(`Remote Build Time: ${remoteBuildInfo?.buildTime || 'unavailable'}`);
    console.log(`verify:production: ${verifyResult}`);
    console.log(`Final result: ${success ? '发布成功' : '发布失败'}`);
  }
}

main().catch((error) => {
  console.error(`Release pipeline crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
