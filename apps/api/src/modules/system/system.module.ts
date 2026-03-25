import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { GitHubModule } from '../github/github.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [PrismaModule, GitHubModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
