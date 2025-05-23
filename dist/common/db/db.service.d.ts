import { OnModuleInit } from '@nestjs/common';
import * as sql from 'mssql';
import { LoggerService } from '../logger/services/logger.service';
import { ConfigService } from '../config/services/config.service';
export interface IObservation {
    ID: number;
    'Observation Title': string;
    'Audit Area': string;
    SBU: string;
    Region: string | null;
    Location: string;
    Department: string | null;
    Reviewer: string;
    'Lead Auditor': string;
    'Support Auditor': string;
    Auditee: string;
    'Sub Process': string;
    'Repeat Observation': string;
    'Observation Type': string;
    Risk: string;
    Category: string;
    'Short Observation': string;
    'Financial Currency': string | null;
    'Financial Implications': string;
    'Target Completion Date': string;
    'Observation Logged Date': string;
    'Audit Report No.': string | null;
    'Report Status': string;
    'Observation Status': string;
    'Target Date': string;
    'Revised Target Date': string;
    'Follow-Up Frequency': string;
    'Closure Date': string;
    'Closure Reason': string;
    Age: number;
    Status: string;
    'Other Auditee': string;
    'Escalator 1': string;
    'Escalator 2': string;
    'Escalator 3': string;
    'Auditee Report Release Date': string | null;
    Quarter: string;
    'Financial Year': string;
    'Action Plan Status': string;
    'Auditee Current Status': string;
    'Last Updated By': string;
    'Audit Type': string;
}
export interface IAuditData {
    AuditSCID: number;
    AreaName: string;
    SBU: string;
    Location: string;
    Reviewer: string;
    LeadAuditor: string;
    SupportAuditor: string;
    auditFrom: string;
    Auditto: string;
    Days: number;
    Status: string;
    PerComp: number;
    'Overdue Days': number;
    Trouble: number;
    NeedsAttention: number;
    OnPlan: number;
    Completed: number;
}
export interface LocationWiseAuditData {
    location: string;
    totalAudits: number;
    trouble: number;
    needsAttention: number;
    onPlan: number;
    completed: number;
}
export interface YearFilterParams {
    startYear?: number;
    endYear?: number;
}
export interface SBUWiseAuditData {
    sbu: string;
    totalAudits: number;
    trouble: number;
    needsAttention: number;
    onPlan: number;
    completed: number;
}
export interface YearWiseAuditData {
    [year: string]: LocationWiseAuditData[];
}
export interface YearWiseSBUData {
    [year: string]: SBUWiseAuditData[];
}
export declare class DatabaseService implements OnModuleInit {
    private readonly db;
    private readonly loggerService;
    private readonly configService;
    private readonly logger;
    private llm;
    constructor(db: sql.ConnectionPool, loggerService: LoggerService, configService: ConfigService);
    onModuleInit(): Promise<void>;
    getAIAuditProgressData(): Promise<IAuditData[]>;
    auditDataForVectorStore(): Promise<string>;
    private createAuditDistribution;
    private formatAuditDistribution;
    getObservationData(): Promise<IObservation[]>;
    observationDataForVectorStore(): Promise<string>;
    private createDistribution;
    private formatDistribution;
    getLocationWiseAuditData(yearFilter?: YearFilterParams): Promise<LocationWiseAuditData[]>;
    getSBUWiseAuditData(yearFilter?: YearFilterParams): Promise<SBUWiseAuditData[]>;
    getYearWiseAuditData(): Promise<YearWiseAuditData>;
    getYearWiseSBUData(): Promise<YearWiseSBUData>;
}
