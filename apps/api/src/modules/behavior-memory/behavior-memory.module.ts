import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { BehaviorMemoryController } from './behavior-memory.controller';
import { BehaviorMemoryService } from './behavior-memory.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [BehaviorMemoryController],
  providers: [BehaviorMemoryService],
  exports: [BehaviorMemoryService],
})
export class BehaviorMemoryModule {}
