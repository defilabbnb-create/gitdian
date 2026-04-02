const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

export function withInternalApiKey(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  const internalApiKey = process.env.INTERNAL_API_KEY?.trim();

  if (typeof window === 'undefined' && internalApiKey) {
    nextHeaders.set(INTERNAL_API_KEY_HEADER, internalApiKey);
  }

  return nextHeaders;
}
