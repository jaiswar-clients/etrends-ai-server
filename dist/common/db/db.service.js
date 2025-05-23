"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DatabaseService_1;
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const sql = require("mssql");
const logger_service_1 = require("../logger/services/logger.service");
const config_service_1 = require("../config/services/config.service");
const sdk_1 = require("@anthropic-ai/sdk");
let DatabaseService = DatabaseService_1 = class DatabaseService {
    constructor(db, loggerService, configService) {
        this.db = db;
        this.loggerService = loggerService;
        this.configService = configService;
        this.logger = new common_1.Logger(DatabaseService_1.name);
        this.llm = new sdk_1.default({
            apiKey: this.configService.get('ANTHROPIC_API_KEY'),
        });
    }
    async onModuleInit() { }
    async getAIAuditProgressData() {
        try {
            const result = await this.db
                .request()
                .query('SELECT * FROM AIAuditProgress');
            this.logger.log('Successfully fetched AI Audit Progress data');
            return result.recordset;
        }
        catch (error) {
            this.logger.error('Error fetching data from AIAuditProgress:', error);
            throw new Error('Failed to fetch AI Audit Progress data');
        }
    }
    async auditDataForVectorStore() {
        try {
            const result = await this.getAIAuditProgressData();
            const totalAudits = result.length;
            const statusDistribution = this.createAuditDistribution(result, 'Status');
            const completedAudits = result.filter((a) => a.Status.includes('Completed')).length;
            const inProgressAudits = result.filter((a) => a.Status.includes('In progress')).length;
            const totalOverdueDays = result.reduce((sum, a) => sum + (a['Overdue Days'] || 0), 0);
            const avgOverdueDays = totalAudits > 0 ? totalOverdueDays / totalAudits : 0;
            const overdueAudits = result.filter((a) => (a['Overdue Days'] || 0) > 0).length;
            const totalTrouble = result.reduce((sum, a) => sum + a.Trouble, 0);
            const totalAttentionNeeded = result.reduce((sum, a) => sum + a.NeedsAttention, 0);
            const currentYear = new Date().getFullYear();
            const currentYearAudits = result.filter((a) => new Date(a.auditFrom).getFullYear() === currentYear).length;
            const sbuDistribution = this.createAuditDistribution(result, 'SBU');
            const locationDistribution = this.createAuditDistribution(result, 'Location');
            const areaDistribution = this.createAuditDistribution(result, 'AreaName');
            const reviewerWorkload = this.createAuditDistribution(result, 'Reviewer');
            const leadAuditorWorkload = this.createAuditDistribution(result, 'LeadAuditor');
            const avgCompletion = totalAudits > 0
                ? result.reduce((sum, a) => sum + a.PerComp, 0) / totalAudits
                : 0;
            let textualData = `Audit Program Overview: \n`;
            textualData += `Total audits: ${totalAudits}. \n`;
            textualData += `Completed audits: ${completedAudits}. \n`;
            textualData += `In-progress audits: ${inProgressAudits}. \n`;
            textualData += `Overdue audits: ${overdueAudits} (Avg ${avgOverdueDays.toFixed(1)} days). \n`;
            textualData += `Critical concerns: ${totalTrouble} trouble cases, ${totalAttentionNeeded} needing attention. \n`;
            textualData += `Current year audits: ${currentYearAudits}. \n`;
            textualData += `Average completion: ${avgCompletion.toFixed(1)}%. \n`;
            textualData += `${this.formatAuditDistribution('Status Distribution', statusDistribution)} \n`;
            textualData += `${this.formatAuditDistribution('Business Unit Distribution', sbuDistribution)} \n`;
            textualData += `${this.formatAuditDistribution('Location Distribution', locationDistribution)} \n`;
            textualData += `${this.formatAuditDistribution('Audit Area Distribution', areaDistribution)} \n`;
            textualData += `${this.formatAuditDistribution('Reviewer Workload', reviewerWorkload)} \n`;
            textualData += `${this.formatAuditDistribution('Lead Auditor Workload', leadAuditorWorkload)} \n`;
            textualData += ` Individual Audits: \n`;
            result.forEach((audit, index) => {
                textualData += `Audit ${index + 1}: `;
                textualData += `Area: ${audit.AreaName}. `;
                textualData += `SBU: ${audit.SBU}. `;
                textualData += `Location: ${audit.Location}. `;
                textualData += `Status: ${audit.Status}. `;
                textualData += `Duration: ${audit.Days ?? 'N/A'} days. `;
                textualData += `Completion: ${audit.PerComp}%. `;
                textualData += `Overdue: ${audit['Overdue Days']} days. `;
                textualData += `Trouble: ${audit.Trouble}. `;
                textualData += `Needs Attention: ${audit.NeedsAttention}. `;
                textualData += `Reviewer: ${audit.Reviewer}. `;
                textualData += `Lead Auditor: ${audit.LeadAuditor || 'Unassigned'}. `;
                textualData += `Period: ${new Date(audit.auditFrom).toLocaleDateString()} - ${new Date(audit.Auditto).toLocaleDateString()}. `;
                textualData += `--- \n`;
            });
            const response = await this.llm.messages.create({
                model: this.configService.get('AI_MODEL'),
                max_tokens: 10000,
                temperature: 0.7,
                system: `
You are a helpful assistant that process the observation data, and create helpfull insights from the data. This data will be used for RAG and will be stored in a vector database.

You have to think possible questions user can ask and create detailed processed data for vector store
DON't Repeat any data from the user input you have to create new insights from the data.
            `,
                messages: [
                    {
                        role: 'user',
                        content: textualData,
                    },
                ],
            });
            const content = response.content[0];
            if (!content) {
                this.loggerService.error(JSON.stringify({
                    message: 'Error generating vector store data: No content returned',
                    data: { response },
                }));
                return '';
            }
            if ('text' in content) {
                return `
        ${textualData}
        ${content.text}
        `;
            }
            else {
                this.loggerService.error(JSON.stringify({
                    message: 'Error generating vector store data: Unexpected content format',
                    data: { contentType: typeof content },
                }));
                return '';
            }
        }
        catch (error) {
            console.error('Error generating audit vector data:', error);
            return '';
        }
    }
    createAuditDistribution(data, field) {
        return data.reduce((acc, item) => {
            const key = item[field]?.toString() || 'Unspecified';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
    }
    formatAuditDistribution(label, distribution) {
        let text = `${label}: `;
        const entries = Object.entries(distribution)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        entries.forEach(([key, count]) => {
            text += `${key} (${count}), `;
        });
        return text.replace(/, $/, '. ');
    }
    async getObservationData() {
        try {
            const result = await this.db
                .request()
                .query('SELECT * FROM AIObservRequest');
            return result.recordset;
        }
        catch (error) {
            this.logger.error('Error fetching data from ObservationData:', error);
            throw new Error('Failed to fetch Observation Data');
        }
    }
    async observationDataForVectorStore() {
        try {
            const result = await this.getObservationData();
            const totalObservations = result.length;
            const totalClosedStatus = result.filter((o) => o.Status === 'Close').length;
            const totalOpenStatus = result.filter((o) => o.Status === 'Open').length;
            const statusRatio = totalObservations > 0
                ? ((totalClosedStatus / totalObservations) * 100).toFixed(1)
                : 0;
            const totalRepeatObservations = result.filter((o) => o['Repeat Observation'] === 'Yes').length;
            const avgAge = totalObservations > 0
                ? result.reduce((sum, o) => sum + o.Age, 0) / totalObservations
                : 0;
            const currentYear = new Date().getFullYear();
            const currentYearObservations = result.filter((o) => o['Financial Year']?.includes(currentYear.toString())).length;
            const riskCounts = this.createDistribution(result, 'Risk');
            const financialImpactCount = result.filter((o) => parseFloat(o['Financial Implications']) > 0).length;
            const breachedObservations = result.filter((o) => o.Status === 'Open' &&
                new Date(o['Target Completion Date']) < new Date()).length;
            const notDueObservations = result.filter((o) => o.Status === 'Close' ||
                new Date(o['Target Completion Date']) >= new Date()).length;
            const locationBreachedCounts = this.createDistribution(result.filter((o) => o.Status === 'Open' &&
                new Date(o['Target Completion Date']) < new Date()), 'Location');
            const riskBreachedCounts = this.createDistribution(result.filter((o) => o.Status === 'Open' &&
                new Date(o['Target Completion Date']) < new Date()), 'Risk');
            const auditAreaCounts = this.createDistribution(result, 'Audit Area');
            const sbuCounts = this.createDistribution(result, 'SBU');
            const regionCounts = this.createDistribution(result, 'Region');
            const departmentCounts = this.createDistribution(result, 'Department');
            const typeCounts = this.createDistribution(result, 'Observation Type');
            const categoryCounts = this.createDistribution(result, 'Category');
            const actionPlanStatus = this.createDistribution(result, 'Action Plan Status');
            let textualData = `Audit Observations Overview: \n`;
            textualData += `Total observations: ${totalObservations} (${statusRatio}% closed). \n`;
            textualData += `Total Open observations: ${totalOpenStatus}. \n`;
            textualData += `Total Repeat observations: ${totalRepeatObservations}. \n`;
            textualData += `Total Breached observations: ${breachedObservations}. \n`;
            textualData += `Total Not due observations: ${notDueObservations}. \n`;
            textualData += `Average age: ${avgAge.toFixed(1)} days. \n`;
            textualData += `Current year observations: ${currentYearObservations}. \n`;
            textualData += `Financial impacts recorded: ${financialImpactCount}. \n`;
            textualData += `Total closed cases: ${totalClosedStatus}. \n`;
            textualData += `Total Regions: ${Object.keys(regionCounts).length}. \n`;
            textualData += `Total SBU: ${Object.keys(sbuCounts).length}. \n`;
            textualData += `Total Audit Areas: ${Object.keys(auditAreaCounts).length}. \n`;
            textualData += `${this.formatDistribution('Risk Distribution', riskCounts)} \n`;
            textualData += `${this.formatDistribution('Location-wise Breached Observations', locationBreachedCounts)} \n`;
            textualData += `${this.formatDistribution('Risk-wise Breached Observations', riskBreachedCounts)} \n`;
            textualData += `${this.formatDistribution('Audit Areas', auditAreaCounts)} \n`;
            textualData += `${this.formatDistribution('SBU Distribution', sbuCounts)} \n`;
            textualData += `${this.formatDistribution('Observation Types', typeCounts)} \n`;
            textualData += `${this.formatDistribution('Categories', categoryCounts)} \n`;
            textualData += `${this.formatDistribution('Action Plan Statuses', actionPlanStatus)} \n`;
            textualData += ` Individual Observations: \n`;
            result.forEach((observation, index) => {
                textualData += `Observation ${index + 1}: `;
                textualData += `Title: ${observation['Observation Title']}. `;
                textualData += `Audit Area: ${observation['Audit Area']}. `;
                textualData += `Risk: ${observation.Risk}. `;
                textualData += `Status: ${observation.Status}. `;
                textualData += `Short Observation: ${observation['Short Observation']}. `;
                textualData += `Financial Implications: ${observation['Financial Implications']}. `;
                textualData += `Target Completion Date: ${observation['Target Completion Date']}. `;
                textualData += `Auditee: ${observation.Auditee}. `;
                textualData += `Lead Auditor: ${observation['Lead Auditor']}. `;
                textualData += `Category: ${observation.Category}. `;
                textualData += `Observation Type: ${observation['Observation Type']}. `;
                textualData += `Repeat Observation: ${observation['Repeat Observation']}. `;
                textualData += `Action Plan Status: ${observation['Action Plan Status']}. `;
                textualData += `Age: ${observation.Age} days. `;
                textualData += `--- \n `;
            });
            const response = await this.llm.messages.create({
                model: this.configService.get('AI_MODEL'),
                max_tokens: 10000,
                temperature: 0.7,
                system: `
You are a helpful assistant that process the observation data, and create helpfull insights from the data. This data will be used for RAG and will be stored in a vector database.

Example of questions user can ask:
Questions.
1.How many open obs
2.How many repeat Obs
3.Risk wise total obs
4.How many obs breached
5.How many not due obs.
6.Location wise breached obs
7.Risk type wise breached obs


You have to think possible questions user can ask and create detailed processed data for vector store
DON't Repeat any data from the user input you have to create new insights from the data.
          `,
                messages: [
                    {
                        role: 'user',
                        content: textualData,
                    },
                ],
            });
            const content = response.content[0];
            if (!content) {
                this.loggerService.error(JSON.stringify({
                    message: 'Error generating vector store data: No content returned',
                    data: { response },
                }));
                return '';
            }
            if ('text' in content) {
                return `
        ${textualData}
        ${content.text}
        `;
            }
            else {
                this.loggerService.error(JSON.stringify({
                    message: 'Error generating vector store data: Unexpected content format',
                    data: { contentType: typeof content },
                }));
                return '';
            }
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error generating vector store data',
                data: { error },
            }));
            return '';
        }
    }
    createDistribution(data, field) {
        return data.reduce((acc, item) => {
            const key = item[field] || 'Unspecified';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
    }
    formatDistribution(label, distribution) {
        let text = `${label}: `;
        const entries = Object.entries(distribution)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        entries.forEach(([key, count]) => {
            text += `${key} (${count}), `;
        });
        return text.replace(/, $/, '. ');
    }
    async getLocationWiseAuditData(yearFilter) {
        try {
            const auditData = await this.getAIAuditProgressData();
            let filteredData = auditData;
            if (yearFilter) {
                filteredData = auditData.filter(audit => {
                    const auditYear = new Date(audit.auditFrom).getFullYear();
                    const startYear = yearFilter.startYear || 0;
                    const endYear = yearFilter.endYear || 9999;
                    return auditYear >= startYear && auditYear <= endYear;
                });
            }
            const locationMap = new Map();
            filteredData.forEach(audit => {
                const location = audit.Location || 'Unknown';
                if (!locationMap.has(location)) {
                    locationMap.set(location, {
                        location,
                        totalAudits: 0,
                        trouble: 0,
                        needsAttention: 0,
                        onPlan: 0,
                        completed: 0
                    });
                }
                const locationData = locationMap.get(location);
                locationData.totalAudits++;
                locationData.trouble += audit.Trouble;
                locationData.needsAttention += audit.NeedsAttention;
                locationData.onPlan += audit.OnPlan;
                locationData.completed += audit.Completed;
            });
            this.loggerService.log(JSON.stringify({
                message: 'Successfully retrieved location-wise audit data',
                data: {
                    totalLocations: locationMap.size,
                    yearFilter,
                    totalRecords: filteredData.length
                },
            }));
            return Array.from(locationMap.values());
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error getting location-wise audit data',
                error,
                yearFilter,
            }));
            throw new Error('Failed to get location-wise audit data');
        }
    }
    async getSBUWiseAuditData(yearFilter) {
        try {
            const auditData = await this.getAIAuditProgressData();
            let filteredData = auditData;
            if (yearFilter) {
                filteredData = auditData.filter(audit => {
                    const auditYear = new Date(audit.auditFrom).getFullYear();
                    const startYear = yearFilter.startYear || 0;
                    const endYear = yearFilter.endYear || 9999;
                    return auditYear >= startYear && auditYear <= endYear;
                });
            }
            const sbuMap = new Map();
            filteredData.forEach(audit => {
                const sbu = audit.SBU || 'Unknown';
                if (!sbuMap.has(sbu)) {
                    sbuMap.set(sbu, {
                        sbu,
                        totalAudits: 0,
                        trouble: 0,
                        needsAttention: 0,
                        onPlan: 0,
                        completed: 0
                    });
                }
                const sbuData = sbuMap.get(sbu);
                sbuData.totalAudits++;
                sbuData.trouble += audit.Trouble;
                sbuData.needsAttention += audit.NeedsAttention;
                sbuData.onPlan += audit.OnPlan;
                sbuData.completed += audit.Completed;
            });
            this.loggerService.log(JSON.stringify({
                message: 'Successfully retrieved SBU-wise audit data',
                data: {
                    totalSBUs: sbuMap.size,
                    yearFilter,
                    totalRecords: filteredData.length
                },
            }));
            return Array.from(sbuMap.values());
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error getting SBU-wise audit data',
                data: { error, yearFilter },
            }));
            throw new Error('Failed to get SBU-wise audit data');
        }
    }
    async getYearWiseAuditData() {
        try {
            const auditData = await this.getAIAuditProgressData();
            const yearMap = {};
            auditData.forEach(audit => {
                const year = new Date(audit.auditFrom).getFullYear().toString();
                const location = audit.Location || 'Unknown';
                if (!yearMap[year]) {
                    yearMap[year] = [];
                }
                let locationData = yearMap[year].find(item => item.location === location);
                if (!locationData) {
                    locationData = {
                        location,
                        totalAudits: 0,
                        trouble: 0,
                        needsAttention: 0,
                        onPlan: 0,
                        completed: 0
                    };
                    yearMap[year].push(locationData);
                }
                locationData.totalAudits++;
                locationData.trouble += audit.Trouble;
                locationData.needsAttention += audit.NeedsAttention;
                locationData.onPlan += audit.OnPlan;
                locationData.completed += audit.Completed;
            });
            const sortedYearMap = {};
            Object.keys(yearMap)
                .sort((a, b) => parseInt(b) - parseInt(a))
                .forEach(year => {
                sortedYearMap[year] = yearMap[year];
            });
            this.loggerService.log(JSON.stringify({
                message: 'Successfully retrieved year-wise audit data',
                data: {
                    totalYears: Object.keys(sortedYearMap).length,
                    years: Object.keys(sortedYearMap),
                },
            }));
            return sortedYearMap;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error getting year-wise audit data',
                data: { error },
            }));
            throw new Error('Failed to get year-wise audit data');
        }
    }
    async getYearWiseSBUData() {
        try {
            const auditData = await this.getAIAuditProgressData();
            const yearMap = {};
            auditData.forEach(audit => {
                const year = new Date(audit.auditFrom).getFullYear().toString();
                const sbu = audit.SBU || 'Unknown';
                if (!yearMap[year]) {
                    yearMap[year] = [];
                }
                let sbuData = yearMap[year].find(item => item.sbu === sbu);
                if (!sbuData) {
                    sbuData = {
                        sbu,
                        totalAudits: 0,
                        trouble: 0,
                        needsAttention: 0,
                        onPlan: 0,
                        completed: 0
                    };
                    yearMap[year].push(sbuData);
                }
                sbuData.totalAudits++;
                sbuData.trouble += audit.Trouble;
                sbuData.needsAttention += audit.NeedsAttention;
                sbuData.onPlan += audit.OnPlan;
                sbuData.completed += audit.Completed;
            });
            const sortedYearMap = {};
            Object.keys(yearMap)
                .sort((a, b) => parseInt(b) - parseInt(a))
                .forEach(year => {
                sortedYearMap[year] = yearMap[year];
            });
            this.loggerService.log(JSON.stringify({
                message: 'Successfully retrieved year-wise SBU audit data',
                data: {
                    totalYears: Object.keys(sortedYearMap).length,
                    years: Object.keys(sortedYearMap),
                },
            }));
            return sortedYearMap;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error getting year-wise SBU audit data',
                data: { error },
            }));
            throw new Error('Failed to get year-wise SBU audit data');
        }
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = DatabaseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('MSSQL_CONNECTION')),
    __metadata("design:paramtypes", [typeof (_a = typeof sql !== "undefined" && sql.ConnectionPool) === "function" ? _a : Object, logger_service_1.LoggerService,
        config_service_1.ConfigService])
], DatabaseService);
//# sourceMappingURL=db.service.js.map