import { NextRequest, NextResponse } from 'next/server';
import { withInternalApiKey } from '@/lib/api/request-headers';

export const dynamic = 'force-dynamic';

const API_PROXY_TIMEOUT_MS = 15_000;

function getBackendApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';
}

function buildProxyUrl(request: NextRequest, pathSegments: string[]) {
  const baseUrl = getBackendApiBaseUrl().replace(/\/$/, '');
  const path = pathSegments.map(encodeURIComponent).join('/');
  return `${baseUrl}/api/${path}${request.nextUrl.search}`;
}

function shouldForwardBody(method: string) {
  return !['GET', 'HEAD'].includes(method.toUpperCase());
}

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_PROXY_TIMEOUT_MS);

  try {
    const body = shouldForwardBody(request.method) ? await request.text() : undefined;
    const upstream = await fetch(buildProxyUrl(request, pathSegments), {
      method: request.method,
      cache: 'no-store',
      signal: controller.signal,
      headers: withInternalApiKey({
        Accept: request.headers.get('accept') ?? 'application/json',
        ...(request.headers.get('content-type')
          ? {
              'Content-Type': request.headers.get('content-type') as string,
            }
          : {}),
      }),
      body,
    });
    const responseBody = await upstream.text();

    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: {
        'Content-Type':
          upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? '代理请求超时，请稍后重试。'
        : '代理请求失败，请稍后重试。';

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}
