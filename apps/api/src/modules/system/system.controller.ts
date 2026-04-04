import { Controller, Get } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('warnings')
  async getWarnings() {
    const data = await this.systemService.getWarnings();

    return {
      success: true,
      data,
      message: 'System warnings fetched.',
    };
  }

  @Get('version')
  getVersion() {
    return {
      success: true,
      data: this.systemService.getVersion(),
      message: 'System version fetched.',
    };
  }
}
