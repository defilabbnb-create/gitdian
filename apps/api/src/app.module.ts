import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { FavoriteModule } from './modules/favorite/favorite.module';
import { FastFilterModule } from './modules/fast-filter/fast-filter.module';
import { GitHubModule } from './modules/github/github.module';
import { JobLogModule } from './modules/job-log/job-log.module';
import { QueueModule } from './modules/queue/queue.module';
import { RepositoryModule } from './modules/repository/repository.module';
import { SettingsModule } from './modules/settings/settings.module';

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    JobLogModule,
    QueueModule,
    AiModule,
    AnalysisModule,
    RepositoryModule,
    FavoriteModule,
    FastFilterModule,
    GitHubModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
