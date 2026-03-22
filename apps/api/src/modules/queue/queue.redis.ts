export function getQueueConnection() {
  const redisUrl = process.env.REDIS_URL?.trim();

  if (redisUrl) {
    return {
      url: redisUrl,
    };
  }

  return {
    host: process.env.REDIS_HOST?.trim() || '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD?.trim() || undefined,
    db: Number(process.env.REDIS_DB ?? 0),
    maxRetriesPerRequest: null,
  };
}
