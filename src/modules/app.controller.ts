import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { DatabaseService } from '@/common/db/db.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private databaseService: DatabaseService,
  ) {}

  @Get('ai-audit-progress')
  async getAIAuditProgressData() {
    return await this.databaseService.getAIAuditProgressData();
  }
}
