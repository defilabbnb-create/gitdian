import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiRouterService } from './ai.router.service';
import { AiService } from './ai.service';
import { OmlxProvider } from './providers/omlx.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  controllers: [AiController],
  providers: [AiRouterService, AiService, OmlxProvider, OpenAiProvider],
  exports: [AiRouterService, AiService, OmlxProvider, OpenAiProvider],
})
export class AiModule {}
