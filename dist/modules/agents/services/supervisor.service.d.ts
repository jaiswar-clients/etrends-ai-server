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
    private chartGenAgent;
    private graph;
    private readonly pdfOutputPath;
    private readonly chartOutputPath;
    constructor(configService: ConfigService, databaseService: DatabaseService, loggerService: LoggerService);
    onModuleInit(): Promise<void>;
    initialize(): Promise<void>;
    private createAgents;
    private AgentState;
    private members;
    private options;
    private summarizeNode;
    private chartGenNode;
    private createSupervisorChain;
    private createGraph;
    run(message: string, threadId?: string): Promise<any>;
    getAuditReport(query: string, threadId?: string): Promise<any>;
}
