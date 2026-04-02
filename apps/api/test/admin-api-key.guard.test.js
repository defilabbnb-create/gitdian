const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AdminApiKeyGuard,
} = require('../dist/common/auth/admin-api-key.guard');

function createContext(headers = {}) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'controller',
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
      }),
    }),
  };
}

test('admin api key guard allows public handlers without a key', () => {
  const guard = new AdminApiKeyGuard({
    getAllAndOverride: () => true,
  });

  assert.equal(guard.canActivate(createContext()), true);
});

test('admin api key guard accepts the configured internal header', () => {
  const previousKey = process.env.INTERNAL_API_KEY;
  process.env.INTERNAL_API_KEY = 'secret-key';

  try {
    const guard = new AdminApiKeyGuard({
      getAllAndOverride: () => false,
    });

    assert.equal(
      guard.canActivate(createContext({ 'x-internal-api-key': 'secret-key' })),
      true,
    );
  } finally {
    process.env.INTERNAL_API_KEY = previousKey;
  }
});

test('admin api key guard rejects invalid keys', () => {
  const previousKey = process.env.INTERNAL_API_KEY;
  process.env.INTERNAL_API_KEY = 'secret-key';

  try {
    const guard = new AdminApiKeyGuard({
      getAllAndOverride: () => false,
    });

    assert.throws(() => guard.canActivate(createContext()), /invalid internal api key/i);
    assert.throws(
      () => guard.canActivate(createContext({ authorization: 'Bearer wrong' })),
      /invalid internal api key/i,
    );
  } finally {
    process.env.INTERNAL_API_KEY = previousKey;
  }
});
