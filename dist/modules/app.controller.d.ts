import { AppService } from './app.service';
import { DatabaseService } from '@/common/db/db.service';
export declare class AppController {
    private readonly appService;
    private databaseService;
    constructor(appService: AppService, databaseService: DatabaseService);
    getAIAuditProgressData(): Promise<import("@/common/db/db.service").IAuditData[]>;
}
