import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalysisModule } from './modules/analysis/analysis.module';
import { BehaviorMemoryModule } from './modules/behavior-memory/behavior-memory.module';
import { FavoriteModule } from './modules/favorite/favorite.module';
import { FastFilterModule } from './modules/fast-filter/fast-filter.module';
import { GitHubModule } from './modules/github/github.module';
import { JobLogModule } from './modules/job-log/job-log.module';
import { QueueModule } from './modules/queue/queue.module';
import { RepositoryModule } from './modules/repository/repository.module';
import { AdaptiveSchedulerModule } from './modules/scheduler/adaptive-scheduler.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SystemModule } from './modules/system/system.module';

@Module({
  imports: [
    PrismaModule,
    BehaviorMemoryModule,
    AdaptiveSchedulerModule,
    SettingsModule,
    SystemModule,
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
