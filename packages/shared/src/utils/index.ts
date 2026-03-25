export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export * from './one-liner-post-validator';
export * from './behavior-memory';
