import { Controller, Get } from '@nestjs/common';
import { OmlxProvider } from './providers/omlx.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Controller('ai')
export class AiController {
  constructor(
    private readonly omlxProvider: OmlxProvider,
    private readonly openAiProvider: OpenAiProvider,
  ) {}

  @Get('health')
  async healthCheck() {
    const [omlx, openai] = await Promise.all([
      this.omlxProvider.healthCheck(),
      this.openAiProvider.healthCheck(),
    ]);

    return {
      success: true,
      data: {
        omlx,
        openai,
      },
      message: 'AI health check completed.',
    };
  }
}
