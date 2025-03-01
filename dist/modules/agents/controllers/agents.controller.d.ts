import { RagService } from '../services/rag.service';
import { SupervisorService } from '../services/supervisor.service';
import { SelfRagService } from '../services/self-rag.service';
export declare class AgentsController {
    private readonly ragService;
    private readonly supervisorService;
    private readonly selfRagService;
    constructor(ragService: RagService, supervisorService: SupervisorService, selfRagService: SelfRagService);
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
    }): Promise<any>;
}
