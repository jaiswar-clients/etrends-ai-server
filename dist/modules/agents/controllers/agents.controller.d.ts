import { RagService } from '../services/rag.service';
import { SupervisorService } from '../services/supervisor.service';
export declare class AgentsController {
    private readonly ragService;
    private readonly supervisorService;
    constructor(ragService: RagService, supervisorService: SupervisorService);
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
        message: string;
        threadId?: string;
    }): Promise<any>;
}
