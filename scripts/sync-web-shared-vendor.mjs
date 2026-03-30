#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const sourceDir = path.join(repoRoot, 'packages/shared/dist');
const targetDir = path.join(repoRoot, 'apps/web/vendor/shared/dist');

if (!existsSync(sourceDir)) {
  throw new Error(`Shared dist not found at ${sourceDir}. Run the shared build first.`);
}

mkdirSync(path.dirname(targetDir), { recursive: true });
rmSync(targetDir, { recursive: true, force: true });
cpSync(sourceDir, targetDir, {
  recursive: true,
  force: true,
});
