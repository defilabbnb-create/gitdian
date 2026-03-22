import { Body, Controller, Get, Put } from '@nestjs/common';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings() {
    const data = await this.settingsService.getSettings();

    return {
      success: true,
      data,
      message: 'Settings fetched.',
    };
  }

  @Get('health')
  async getHealth() {
    const data = await this.settingsService.getSystemHealth();

    return {
      success: true,
      data,
      message: 'System health check completed.',
    };
  }

  @Put()
  async updateSettings(@Body() updateSettingsDto: UpdateSettingsDto) {
    const data = await this.settingsService.updateSettings(updateSettingsDto);

    return {
      success: true,
      data,
      message: 'Settings updated.',
    };
  }
}
