import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PublicApi } from './common/auth/public-api.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @PublicApi()
  @Get('health')
  getHealth(): string {
    return this.appService.getHealth();
  }
}
