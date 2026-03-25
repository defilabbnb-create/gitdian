import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiRouterService } from './ai.router.service';
import { AiService } from './ai.service';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OmlxProvider } from './providers/omlx.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  controllers: [AiController],
  providers: [
    AiRouterService,
    AiService,
    OmlxProvider,
    OpenAiProvider,
    AnthropicProvider,
  ],
  exports: [
    AiRouterService,
    AiService,
    OmlxProvider,
    OpenAiProvider,
    AnthropicProvider,
  ],
})
export class AiModule {}
