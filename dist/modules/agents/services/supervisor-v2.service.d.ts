import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@/common/config/services/config.service';
import { DatabaseService } from '@/common/db/db.service';
import { LoggerService } from '@/common/logger/services/logger.service';
export declare class SupervisorV2Service implements OnModuleInit {
    private readonly configService;
    private readonly databaseService;
    private readonly loggerService;
    private anthropic;
    private readonly pdfOutputPath;
    private readonly chartOutputPath;
    private model;
    constructor(configService: ConfigService, databaseService: DatabaseService, loggerService: LoggerService);
    onModuleInit(): Promise<void>;
    initialize(): Promise<void>;
    setModel(model: string): Promise<void>;
    generateSummaryReport(content: string, threadId?: string): Promise<{
        content: string;
        pdf: string;
    }>;
    generatePDF(content: string): Promise<string>;
    run(task: string, threadId?: string): Promise<{
        content: string;
        pdf: string;
    }>;
    getFileUrl(filename: string): Promise<string>;
    getAllReports(): Promise<{
        filename: string;
        url: string;
        createdAt: string;
    }[]>;
}
