import assert from 'node:assert/strict';
import test from 'node:test';
import { withInternalApiKey } from '../src/lib/api/request-headers';

test('withInternalApiKey keeps headers unchanged without a server key', () => {
  const previousKey = process.env.INTERNAL_API_KEY;
  delete process.env.INTERNAL_API_KEY;

  try {
    const headers = withInternalApiKey({
      Accept: 'application/json',
    });

    assert.equal(headers.get('accept'), 'application/json');
    assert.equal(headers.get('x-internal-api-key'), null);
  } finally {
    process.env.INTERNAL_API_KEY = previousKey;
  }
});

test('withInternalApiKey appends the internal header on the server', () => {
  const previousKey = process.env.INTERNAL_API_KEY;
  process.env.INTERNAL_API_KEY = 'secret-key';

  try {
    const headers = withInternalApiKey({
      Accept: 'application/json',
    });

    assert.equal(headers.get('accept'), 'application/json');
    assert.equal(headers.get('x-internal-api-key'), 'secret-key');
  } finally {
    process.env.INTERNAL_API_KEY = previousKey;
  }
});
