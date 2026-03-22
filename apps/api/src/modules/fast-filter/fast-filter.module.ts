import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { FastFilterController } from './fast-filter.controller';
import { FastFilterService } from './fast-filter.service';

@Module({
  imports: [AiModule],
  controllers: [FastFilterController],
  providers: [FastFilterService],
  exports: [FastFilterService],
})
export class FastFilterModule {}
