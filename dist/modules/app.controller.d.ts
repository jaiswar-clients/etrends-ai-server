import { AppService } from './app.service';
import { DatabaseService } from '@/common/db/db.service';
export declare class AppController {
    private readonly appService;
    private databaseService;
    constructor(appService: AppService, databaseService: DatabaseService);
    getAIAuditProgressData(): Promise<import("@/common/db/db.service").IAuditData[]>;
    getObservations(): Promise<import("@/common/db/db.service").IObservation[]>;
    getLocationWiseAudits(startYear?: number, endYear?: number): Promise<import("@/common/db/db.service").LocationWiseAuditData[]>;
    getSBUWiseAudits(startYear?: number, endYear?: number): Promise<import("@/common/db/db.service").SBUWiseAuditData[]>;
    getYearWiseAudits(): Promise<import("@/common/db/db.service").YearWiseSBUData>;
}
