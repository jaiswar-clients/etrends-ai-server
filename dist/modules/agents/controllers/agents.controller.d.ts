import { RagService } from '../services/rag.service';
import { SupervisorService } from '../services/supervisor.service';
import { SelfRagService } from '../services/self-rag.service';
import { SupervisorV2Service } from '../services/supervisor-v2.service';
import { SummaryService } from '../services/summary.service';
export declare class AgentsController {
    private readonly ragService;
    private readonly supervisorService;
    private readonly selfRagService;
    private readonly supervisorV2Service;
    private readonly summaryService;
    constructor(ragService: RagService, supervisorService: SupervisorService, selfRagService: SelfRagService, supervisorV2Service: SupervisorV2Service, summaryService: SummaryService);
    getAllReports(): Promise<{
        filename: string;
        url: string;
        createdAt: string;
    }[]>;
    askAgent(body: {
        question: string;
        threadId?: string;
    }): Promise<any>;
    runSupervisor(body: {
        question: string;
        threadId?: string;
    }): Promise<{
        content: string;
        pdf: string;
    }>;
    getSBUWiseSummary(): Promise<string>;
    getAuditWiseSummary(): Promise<string>;
}
