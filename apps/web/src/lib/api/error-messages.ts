export function getFriendlyRuntimeError(
  error: unknown,
  fallbackMessage: string,
): string {
  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  const message = error.message.trim();

  if (!message) {
    return fallbackMessage;
  }

  const normalized = message.toLowerCase();

  const errorStatus =
    'status' in error && typeof error.status === 'number'
      ? error.status
      : null;

  if (
    errorStatus === 502 ||
    errorStatus === 503 ||
    errorStatus === 504 ||
    normalized.includes('代理请求失败') ||
    normalized.includes('proxy request failed') ||
    normalized.includes('bad gateway') ||
    normalized.includes('gateway') ||
    normalized.includes('service unavailable')
  ) {
    return '后端接口当前不可达，前端先切到降级展示。请先确认 API 服务是否在线，再刷新当前页面。';
  }

  if (
    normalized.includes('aborted due to timeout') ||
    normalized.includes('timeout')
  ) {
    return '请求超时了，前端已自动降级。请稍后刷新；如果持续出现，优先检查后端或代理链路。';
  }

  if (
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('econnrefused') ||
    normalized.includes('socket')
  ) {
    return '后端连接暂时不稳定，系统先把能展示的内容显示出来。';
  }

  if (normalized.includes('unexpected token') || normalized.includes('json')) {
    return '返回数据格式暂时异常，系统已自动降级展示。';
  }

  return message;
}
