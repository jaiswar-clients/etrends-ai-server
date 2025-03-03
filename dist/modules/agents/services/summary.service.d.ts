import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@/common/config/services/config.service';
import { DatabaseService } from '@/common/db/db.service';
import { LoggerService } from '@/common/logger/services/logger.service';
export declare class SummaryService implements OnModuleInit {
    private readonly configService;
    private readonly databaseService;
    private readonly loggerService;
    private anthropic;
    private model;
    constructor(configService: ConfigService, databaseService: DatabaseService, loggerService: LoggerService);
    onModuleInit(): Promise<void>;
    initialize(): Promise<void>;
    setModel(model: string): Promise<void>;
    generateSBUWiseSummary(): Promise<string>;
    generateLocationWiseSummary(): Promise<string>;
}
