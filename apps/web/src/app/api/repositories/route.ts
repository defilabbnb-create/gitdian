import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REPOSITORY_PROXY_TIMEOUT_MS = 8_000;

function getBackendApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
}

function buildRepositoryProxyUrl(request: NextRequest) {
  const baseUrl = getBackendApiBaseUrl().replace(/\/$/, '');
  return `${baseUrl}/api/repositories${request.nextUrl.search}`;
}

function tryParseJsonBody(body: string) {
  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REPOSITORY_PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(buildRepositoryProxyUrl(request), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    const body = await response.text();
    const parsedBody = tryParseJsonBody(body);

    if (!parsedBody) {
      const message = response.ok
        ? '完整机会池返回了非 JSON 数据，系统已自动拦截。'
        : '完整机会池上游暂时不可用，请稍后重试。';

      return NextResponse.json(
        {
          success: false,
          message,
        },
        {
          status: response.ok ? 502 : response.status,
        },
      );
    }

    return NextResponse.json(parsedBody, {
      status: response.status,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? '完整机会池请求超时，请重试。'
        : '完整机会池请求失败，请重试。';

    return NextResponse.json(
      {
        success: false,
        message,
      },
      {
        status: 504,
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
