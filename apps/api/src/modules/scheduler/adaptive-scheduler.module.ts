import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AdaptiveSchedulerService } from './adaptive-scheduler.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AdaptiveSchedulerService],
  exports: [AdaptiveSchedulerService],
})
export class AdaptiveSchedulerModule {}
