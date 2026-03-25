import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { BehaviorMemoryService } from './behavior-memory.service';

@Controller('settings/behavior-memory')
export class BehaviorMemoryController {
  constructor(private readonly behaviorMemoryService: BehaviorMemoryService) {}

  @Get()
  async getBehaviorMemory() {
    const data = await this.behaviorMemoryService.getState();

    return {
      success: true,
      data,
      message: 'Behavior memory fetched.',
    };
  }

  @Put()
  async updateBehaviorMemory(@Body() payload: unknown) {
    const data = await this.behaviorMemoryService.updateState(payload);

    return {
      success: true,
      data,
      message: 'Behavior memory updated.',
    };
  }

  @Delete()
  async clearBehaviorMemory() {
    const data = await this.behaviorMemoryService.clearState();

    return {
      success: true,
      data,
      message: 'Behavior memory cleared.',
    };
  }
}
