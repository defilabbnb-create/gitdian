import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { RepositoryController } from './repository.controller';
import { RepositoryService } from './repository.service';

@Module({
  imports: [AnalysisModule],
  controllers: [RepositoryController, ExportController],
  providers: [RepositoryService, ExportService],
})
export class RepositoryModule {}
