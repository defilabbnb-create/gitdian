import assert from 'node:assert/strict';
import test from 'node:test';
import { getFriendlyRuntimeError } from '../src/lib/api/error-messages';

test('friendly runtime error upgrades 504 and proxy failures into backend guidance', () => {
  const error = new Error('代理请求失败，请稍后重试。') as Error & {
    status?: number;
  };
  error.status = 504;

  assert.equal(
    getFriendlyRuntimeError(error, 'fallback'),
    '后端接口当前不可达，前端先切到降级展示。请先确认 API 服务是否在线，再刷新当前页面。',
  );
});
