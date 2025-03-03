import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { DatabaseService } from '@/common/db/db.service';
import { YearFilterParams } from '@/common/db/db.service';

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

  @Get('observations')
  async getObservations() {
    return await this.databaseService.getObservationData();
  }

  @Get('location-wise-audits')
  async getLocationWiseAudits(
    @Query('startYear') startYear?: number,
    @Query('endYear') endYear?: number,
  ) {
    const yearFilter: YearFilterParams = {};
    
    if (startYear) yearFilter.startYear = startYear;
    if (endYear) yearFilter.endYear = endYear;

    return await this.databaseService.getLocationWiseAuditData(
      Object.keys(yearFilter).length ? yearFilter : undefined
    );
  }

  @Get('sbu-wise-audits')
  async getSBUWiseAudits(
    @Query('startYear') startYear?: number,
    @Query('endYear') endYear?: number,
  ) {
    const yearFilter: YearFilterParams = {};
    
    if (startYear) yearFilter.startYear = parseInt(startYear.toString(), 10);
    if (endYear) yearFilter.endYear = parseInt(endYear.toString(), 10);

    return await this.databaseService.getSBUWiseAuditData(
      Object.keys(yearFilter).length ? yearFilter : undefined
    );
  }

  @Get('year-wise-audits')
  async getYearWiseAudits() {
    return await this.databaseService.getYearWiseAuditData();
  }
}
