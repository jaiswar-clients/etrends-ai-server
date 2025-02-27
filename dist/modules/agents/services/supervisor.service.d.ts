import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@/common/config/services/config.service';
import { DatabaseService } from '@/common/db/db.service';
import { LoggerService } from '@/common/logger/services/logger.service';
export declare class SupervisorService implements OnModuleInit {
    private readonly configService;
    private readonly databaseService;
    private readonly loggerService;
    private llm;
    private summarizeAgent;
    private supervisor;
    private readonly pdfOutputPath;
    private readonly chartOutputPath;
    private AgentState;
    private members;
    constructor(configService: ConfigService, databaseService: DatabaseService, loggerService: LoggerService);
    onModuleInit(): Promise<void>;
    initialize(): Promise<void>;
    createAgents(): Promise<void>;
    createSummarizeAgent(): Promise<any>;
    createSupervisor(): Promise<string>;
    generateSummaryReport(content: string, threadId?: string): Promise<any>;
    run(task: string, threadId?: string): Promise<any>;
    getFileUrl(filename: string): Promise<string>;
    getAllReports(): Promise<{
        filename: string;
        url: string;
        createdAt: string;
    }[]>;
}
