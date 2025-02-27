import { Module } from '@nestjs/common';
import { DatabaseService } from './db.service';
import * as sql from 'mssql';
import { ConfigService } from '@/common/config/services/config.service';

@Module({
  providers: [
    DatabaseService,
    {
      provide: 'MSSQL_CONNECTION',
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const config = {
          user: configService.get('DATABASE_USER'),
          password: configService.get('DATABASE_PASSWORD'),
          server: configService.get('DATABASE_URL'),
          port: parseInt(configService.get('DATABASE_PORT')),
          database: configService.get('DATABASE_NAME'),
          options: {
            encrypt: false,
            trustServerCertificate: false,
          },
          pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
          },
          requestTimeout: 30000
        };

        try {
          const pool = await sql.connect(config);
          console.log('Connected to SQL Server');
          return pool;
        } catch (error) {
          console.error('Database connection failed:', error);
          throw error;
        }
      },
    },
  ],
  exports: [DatabaseService, 'MSSQL_CONNECTION'],
})
export class DatabaseModule {} 