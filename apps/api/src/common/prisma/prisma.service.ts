import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const DEFAULT_SCRIPT_CONNECTION_LIMIT = 6;

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolvePrismaDatasourceUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return null;
  }

  const explicitLimit =
    parsePositiveInt(process.env.PRISMA_CONNECTION_LIMIT) ??
    parsePositiveInt(process.env.PRISMA_SCRIPT_CONNECTION_LIMIT);
  const scriptModeLimit =
    process.env.ENABLE_QUEUE_WORKERS === 'false'
      ? DEFAULT_SCRIPT_CONNECTION_LIMIT
      : null;
  const connectionLimit = explicitLimit ?? scriptModeLimit;

  if (!connectionLimit) {
    return null;
  }

  try {
    const url = new URL(databaseUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', String(connectionLimit));
    }
    return url.toString();
  } catch {
    return null;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const datasourceUrl = resolvePrismaDatasourceUrl();
    super(
      datasourceUrl
        ? {
            datasources: {
              db: {
                url: datasourceUrl,
              },
            },
          }
        : undefined,
    );
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
