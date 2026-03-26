import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsBuildInfo } from '../src/components/settings/settings-build-info';
import { SettingsForm } from '../src/components/settings/settings-form';
import { SettingsHealthOverview } from '../src/components/settings/settings-health-overview';
import { SettingsRuntimeSummary } from '../src/components/settings/settings-runtime-summary';
import { SettingsTechnicalDetails } from '../src/components/settings/settings-technical-details';
import type {
  AiHealthPayload,
  SettingsHealthPayload,
  SettingsPayload,
} from '../src/lib/types/settings';

const settingsFixture: SettingsPayload = {
  github: {
    search: {
      defaultMode: 'updated',
      defaultSort: 'updated',
      defaultOrder: 'desc',
      defaultPerPage: 24,
      defaultStarMin: 50,
      defaultStarMax: 5000,
      defaultPushedAfterDays: 30,
    },
    fetch: {
      runFastFilterByDefault: true,
    },
  },
  fastFilter: {
    batch: {
      defaultLimit: 60,
    },
    onlyUnscreenedByDefault: true,
    staleDaysThreshold: 14,
    scoreThresholdA: 80,
    scoreThresholdB: 60,
  },
  ai: {
    defaultProvider: 'omlx',
    fallbackProvider: 'openai',
    enableFallback: true,
    timeoutMs: 20000,
    taskRouting: {
      rough_filter: 'omlx',
      completeness: 'omlx',
      basic_analysis: 'omlx',
      idea_fit: 'omlx',
      idea_extract: 'omlx',
    },
    models: {
      omlx: 'local-122b',
      omlxLight: 'local-32b',
      omlxDeep: 'local-122b',
      openai: 'gpt-5',
    },
  },
};

const healthFixture: SettingsHealthPayload = {
  database: {
    ok: true,
    latencyMs: 12,
    error: null,
  },
  ai: {
    omlx: {
      ok: true,
      model: 'local-122b',
      latencyMs: 340,
      error: null,
    },
    openai: {
      ok: false,
      model: 'gpt-5',
      latencyMs: null,
      error: 'disabled',
    },
  },
  github: {
    ok: true,
    hasToken: true,
    hasTokenPool: true,
    tokenPoolSize: 3,
    usingMultiToken: true,
    anonymousFallback: false,
    lastKnownRateLimitStatus: null,
    latencyMs: 210,
    error: null,
  },
};

const aiHealthFixture: AiHealthPayload = {
  omlx: {
    ok: true,
    model: 'local-122b',
    latencyMs: 320,
    error: null,
  },
  openai: {
    ok: false,
    model: 'gpt-5',
    latencyMs: null,
    error: 'disabled',
  },
  claude: {
    ok: true,
    model: 'claude-sonnet',
    latencyMs: 420,
    error: null,
  },
};

test('settings first screen shows runtime summary and health summary', () => {
  const html = renderToStaticMarkup(
    <div>
      <SettingsBuildInfo variant="compact" />
      <SettingsRuntimeSummary
        settings={settingsFixture}
        health={healthFixture}
        aiHealth={aiHealthFixture}
      />
      <SettingsHealthOverview
        health={healthFixture}
        aiHealth={aiHealthFixture}
      />
    </div>,
  );

  assert.match(html, /当前运行模式/);
  assert.match(html, /系统健康摘要/);
  assert.match(html, /Git SHA:/);
  assert.match(html, /Environment:/);
  assert.match(html, /Build Time:/);
});

test('settings form keeps only one configuration group expanded by default', () => {
  const html = renderToStaticMarkup(<SettingsForm initialSettings={settingsFixture} />);
  const sectionMatches = html.match(/data-settings-section=/g) ?? [];
  const openMatches = html.match(/open=""/g) ?? [];

  assert.equal(sectionMatches.length, 3);
  assert.equal(openMatches.length, 1);
  assert.match(html, /id="settings-github"/);
});

test('behavior notes no longer occupy the first screen by default', () => {
  const html = renderToStaticMarkup(
    <SettingsTechnicalDetails health={healthFixture} healthErrorMessage={null} />,
  );

  assert.match(html, /展开工程细项/);
  assert.doesNotMatch(html, /GitHub 默认模式/);
  assert.doesNotMatch(html, /AI Fallback/);
  assert.doesNotMatch(html, /Fast Filter/);
});
