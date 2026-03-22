import { Injectable } from '@nestjs/common';
import { AiRouterService } from './ai.router.service';
import { GenerateJsonInput } from './interfaces/ai.types';

@Injectable()
export class AiService {
  constructor(private readonly aiRouterService: AiRouterService) {}

  async generateJson<T>(input: GenerateJsonInput) {
    return this.aiRouterService.generateJson<T>(input);
  }
}
