export async function runWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  if (!items.length) {
    return [];
  }

  const resolvedConcurrency = Math.max(1, Math.floor(concurrency));
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    for (;;) {
      const currentIndex = nextIndex;
      if (currentIndex >= items.length) {
        break;
      }
      nextIndex += 1;
      results[currentIndex] = await handler(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(resolvedConcurrency, items.length) },
      () => worker(),
    ),
  );

  return results;
}
