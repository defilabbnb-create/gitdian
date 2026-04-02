import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import {
  INTERNAL_API_KEY_HEADER,
  PUBLIC_API_METADATA_KEY,
} from './admin-api-key.constants';

type RequestWithHeaders = {
  headers?: Record<string, string | string[] | undefined>;
};

function readHeader(
  headers: RequestWithHeaders['headers'],
  name: string,
): string | null {
  if (!headers) {
    return null;
  }

  const value = headers[name];
  if (typeof value === 'string') {
    return value.trim() || null;
  }

  if (Array.isArray(value)) {
    return value.find((item) => item.trim().length > 0)?.trim() ?? null;
  }

  return null;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function extractBearerToken(value: string | null) {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
    return null;
  }

  return token.trim();
}

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(AdminApiKeyGuard.name);
  private warnedMissingKeyInDevelopment = false;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublicApi = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_API_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublicApi) {
      return true;
    }

    const configuredKey = process.env.INTERNAL_API_KEY?.trim() ?? '';
    if (!configuredKey) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          'Protected API request denied because INTERNAL_API_KEY is not configured.',
        );
        throw new ServiceUnavailableException(
          'INTERNAL_API_KEY is not configured.',
        );
      }

      if (!this.warnedMissingKeyInDevelopment) {
        this.warnedMissingKeyInDevelopment = true;
        this.logger.warn(
          'INTERNAL_API_KEY is not configured; protected API routes are open in non-production mode.',
        );
      }

      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const providedKey =
      readHeader(request.headers, INTERNAL_API_KEY_HEADER) ??
      extractBearerToken(readHeader(request.headers, 'authorization'));

    if (!providedKey || !safeEqual(providedKey, configuredKey)) {
      throw new UnauthorizedException('Missing or invalid internal API key.');
    }

    return true;
  }
}
