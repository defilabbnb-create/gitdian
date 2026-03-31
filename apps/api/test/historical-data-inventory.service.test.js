const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HistoricalDataInventoryService,
} = require('../dist/modules/analysis/historical-data-inventory.service');

test('historical inventory service skips isolated bad repository rows instead of failing the whole batch', async () => {
  const calls = [];
  const prisma = {
    repository: {
      findMany: async (args) => {
        const ids = [...args.where.id.in];
        calls.push(ids);

        if (ids.includes('bad-repo')) {
          throw new Error('Failed to convert rust `String` into napi `string`');
        }

        return ids.map((id) => ({ id }));
      },
    },
  };
  const service = new HistoricalDataInventoryService(prisma, {});

  const rows = await service.loadRepositoriesByIds([
    'good-2',
    'bad-repo',
    'good-1',
  ]);

  assert.deepEqual(
    rows.map((row) => row.id),
    ['good-1', 'good-2'],
  );
  assert.equal(
    calls.some((ids) => ids.length === 1 && ids[0] === 'bad-repo'),
    true,
  );
});
