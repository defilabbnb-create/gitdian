import { Controller, Get } from '@nestjs/common';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OmlxProvider } from './providers/omlx.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Controller('ai')
export class AiController {
  constructor(
    private readonly omlxProvider: OmlxProvider,
    private readonly openAiProvider: OpenAiProvider,
    private readonly anthropicProvider: AnthropicProvider,
  ) {}

  @Get('health')
  async healthCheck() {
    const [omlx, openai, claude] = await Promise.all([
      this.omlxProvider.healthCheck(),
      this.openAiProvider.healthCheck(),
      this.anthropicProvider.healthCheck(),
    ]);

    return {
      success: true,
      data: {
        omlx,
        openai,
        claude,
      },
      message: 'AI health check completed.',
    };
  }
}
