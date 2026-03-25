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

  if (
    normalized.includes('aborted due to timeout') ||
    normalized.includes('timeout')
  ) {
    return '请求超时了，系统先展示其余可用内容，你稍后刷新即可。';
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
