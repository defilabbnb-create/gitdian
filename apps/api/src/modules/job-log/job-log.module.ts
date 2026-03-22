import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { JobLogController } from './job-log.controller';
import { JobLogService } from './job-log.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [JobLogController],
  providers: [JobLogService],
  exports: [JobLogService],
})
export class JobLogModule {}
