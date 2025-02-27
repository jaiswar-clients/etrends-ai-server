import * as sql from 'mssql';
export declare class DatabaseService {
    private readonly db;
    private readonly logger;
    constructor(db: sql.ConnectionPool);
    getAIAuditProgressData(): Promise<{
        success: boolean;
        data: any;
    }>;
}
