const test = require('node:test');
const assert = require('node:assert/strict');

const { OpenAiProvider } = require('../dist/modules/ai/providers/openai.provider');
const { AnthropicProvider } = require('../dist/modules/ai/providers/anthropic.provider');

function withEnv(overrides, run) {
  const previous = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of previous.entries()) {
        if (typeof value === 'string') {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      }
    });
}

function createJsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

test('openai provider retries once after a 429 response', async () => {
  const originalFetch = global.fetch;
  let attempts = 0;

  await withEnv(
    {
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'gpt-5.4-mini',
      OPENAI_BASE_URL: 'https://example.invalid/v1',
      OPENAI_RETRY_MAX: '1',
      OPENAI_MAX_CONCURRENCY: '2',
    },
    async () => {
      global.fetch = async () => {
        attempts += 1;

        if (attempts === 1) {
          return {
            ok: false,
            status: 429,
            headers: new Headers({ 'retry-after': '0' }),
            text: async () =>
              JSON.stringify({
                error: {
                  message: 'Concurrency limit exceeded',
                },
              }),
          };
        }

        return createJsonResponse({
          choices: [
            {
              message: {
                content: '{"ok":true}',
              },
            },
          ],
        });
      };

      const provider = new OpenAiProvider();
      const result = await provider.generateJson({
        taskType: 'basic_analysis',
        prompt: 'Return {"ok":true}',
      });

      assert.equal(attempts, 2);
      assert.deepEqual(result.data, { ok: true });
    },
  );

  global.fetch = originalFetch;
});

test('openai provider limits in-process request concurrency', async () => {
  const originalFetch = global.fetch;
  let concurrent = 0;
  let maxConcurrent = 0;

  await withEnv(
    {
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'gpt-5.4-mini',
      OPENAI_BASE_URL: 'https://example.invalid/v1',
      OPENAI_RETRY_MAX: '0',
      OPENAI_MAX_CONCURRENCY: '1',
    },
    async () => {
      global.fetch = async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 20));
        concurrent -= 1;

        return createJsonResponse({
          choices: [
            {
              message: {
                content: '{"ok":true}',
              },
            },
          ],
        });
      };

      const provider = new OpenAiProvider();
      const results = await Promise.all([
        provider.generateJson({ taskType: 'basic_analysis', prompt: 'a' }),
        provider.generateJson({ taskType: 'basic_analysis', prompt: 'b' }),
        provider.generateJson({ taskType: 'basic_analysis', prompt: 'c' }),
      ]);

      assert.equal(maxConcurrent, 1);
      assert.equal(results.length, 3);
    },
  );

  global.fetch = originalFetch;
});

test('anthropic provider reports retired runtime by default', async () => {
  await withEnv(
    {
      CLAUDE_RUNTIME_RETIRED: 'true',
      CLAUDE_ENABLED: 'true',
      CLAUDE_API_KEY: 'test-key',
      CLAUDE_MODEL: 'claude-opus-4-6',
    },
    async () => {
      const provider = new AnthropicProvider();
      assert.equal(provider.isRetired(), true);
      assert.equal(provider.isEnabled(), false);
      assert.equal(provider.isConfigured(), false);

      const health = await provider.healthCheck();
      assert.equal(health.ok, false);
      assert.match(health.error, /retired/i);

      await assert.rejects(
        () =>
          provider.generateJson({
            prompt: 'Return {"ok":true}',
          }),
        /retired/i,
      );
    },
  );
});
