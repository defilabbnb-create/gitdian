import { Injectable, Logger } from '@nestjs/common';

export type TelegramSendResult = {
  ok: boolean;
  messageId: string | null;
  chatId: string;
};

@Injectable()
export class TelegramNotifierService {
  private readonly logger = new Logger(TelegramNotifierService.name);

  isEnabled() {
    return (
      process.env.ENABLE_DAILY_TELEGRAM_REPORT?.toLowerCase() === 'true'
    );
  }

  isConfigured() {
    return Boolean(
      this.resolveBotToken() &&
        this.resolveChatId(),
    );
  }

  async sendMessage(text: string) {
    const botToken = this.resolveBotToken();
    const chatId = this.resolveChatId();

    if (!botToken || !chatId) {
      throw new Error(
        'Telegram notifier is not configured. TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.',
      );
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body = {
      chat_id: chatId,
      text: text.slice(0, 4000),
      disable_web_page_preview: true,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const startedAt = Date.now();

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
        });
        const raw = await response.text();
        const payload = raw ? this.safeJsonParse(raw) : null;
        const payloadRecord =
          payload && typeof payload === 'object' && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : null;

        if (!response.ok || payloadRecord?.ok !== true) {
          const description =
            this.cleanText(
              payloadRecord?.description ?? raw,
              240,
            ) || 'Unknown Telegram API error.';
          throw new Error(
            `Telegram sendMessage failed (status=${response.status}): ${description}`,
          );
        }

        const result = payloadRecord?.result as
          | Record<string, unknown>
          | undefined;
        const messageId = result?.message_id != null ? String(result.message_id) : null;

        this.logger.log(
          `Telegram daily report sent. latencyMs=${Date.now() - startedAt} messageId=${messageId ?? 'unknown'}`,
        );

        return {
          ok: true,
          messageId,
          chatId,
        } satisfies TelegramSendResult;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown Telegram send error.');

        if (attempt < 3) {
          await this.sleep(attempt * 1_000);
          continue;
        }
      }
    }

    throw lastError ?? new Error('Telegram send failed.');
  }

  private resolveBotToken() {
    return process.env.TELEGRAM_BOT_TOKEN?.trim() || null;
  }

  private resolveChatId() {
    return process.env.TELEGRAM_CHAT_ID?.trim() || null;
  }

  private safeJsonParse(value: string) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  private cleanText(value: unknown, maxLength: number) {
    const normalized = String(value ?? '').trim();

    if (!normalized) {
      return '';
    }

    return normalized.length > maxLength
      ? `${normalized.slice(0, maxLength - 1)}…`
      : normalized;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
