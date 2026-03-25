import { Controller, Get, Header, Query } from '@nestjs/common';
import { ExportService } from './export.service';

@Controller('export')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('top-projects')
  async exportTopProjects(@Query('limit') limit?: string) {
    const data = await this.exportService.exportTopProjects(
      Number(limit || 50) || 50,
    );

    return data;
  }

  @Get('training-data')
  @Header('Content-Type', 'application/x-ndjson; charset=utf-8')
  async exportTrainingData(@Query('sampleSize') sampleSize?: string) {
    return this.exportService.exportTrainingData(
      Number(sampleSize || 120) || 120,
    );
  }

  @Get('audit-report')
  async exportAuditReport() {
    return this.exportService.exportAuditReport();
  }
}
