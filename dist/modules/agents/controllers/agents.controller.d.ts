import { RagService } from '../services/rag.service';
import { SupervisorService } from '../services/supervisor.service';
export declare class AgentsController {
    private readonly ragService;
    private readonly supervisorService;
    constructor(ragService: RagService, supervisorService: SupervisorService);
    askAgent(body: {
        question: string;
        threadId?: string;
    }): Promise<any>;
    runSupervisor(body: {
        message: string;
        threadId?: string;
    }): Promise<any>;
    getAuditReport(body: {
        query: string;
        threadId?: string;
    }): Promise<any>;
    getFile(filename: string): {
        url: string;
    };
}
