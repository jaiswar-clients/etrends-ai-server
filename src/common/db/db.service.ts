import { Inject, Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @Inject('MSSQL_CONNECTION') private readonly db: sql.ConnectionPool,
  ) {}

  async getAIAuditProgressData() {
    try {
      const result = await this.db
        .request()
        .query('SELECT * FROM AIAuditProgress');
      
      this.logger.log('Successfully fetched AI Audit Progress data');
      return {
        success: true,
        data: result.recordset,
      };
    } catch (error) {
      this.logger.error('Error fetching data from AIAuditProgress:', error);
      throw new Error('Failed to fetch AI Audit Progress data');
    }
  }
}
