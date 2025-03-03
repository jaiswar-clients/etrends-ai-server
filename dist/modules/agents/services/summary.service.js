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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SummaryService = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../../common/config/services/config.service");
const sdk_1 = require("@anthropic-ai/sdk");
const db_service_1 = require("../../../common/db/db.service");
const logger_service_1 = require("../../../common/logger/services/logger.service");
const index_1 = require("../../../prompts/index");
let SummaryService = class SummaryService {
    constructor(configService, databaseService, loggerService) {
        this.configService = configService;
        this.databaseService = databaseService;
        this.loggerService = loggerService;
        this.model = this.configService.get('AI_MODEL') || 'claude-3-sonnet-20240229';
    }
    async onModuleInit() {
        try {
            await this.initialize();
            this.loggerService.log(JSON.stringify({
                message: 'SummaryService initialized successfully',
                service: 'SummaryService',
                method: 'onModuleInit',
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error initializing SummaryService',
                service: 'SummaryService',
                method: 'onModuleInit',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async initialize() {
        try {
            this.anthropic = new sdk_1.default({
                apiKey: this.configService.get('ANTHROPIC_API_KEY'),
            });
            this.loggerService.log(JSON.stringify({
                message: 'Anthropic client initialized',
                service: 'SummaryService',
                method: 'initialize',
                model: this.model,
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error in initialization',
                service: 'SummaryService',
                method: 'initialize',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async setModel(model) {
        this.model = model;
        this.loggerService.log(JSON.stringify({
            message: 'Model updated',
            service: 'SummaryService',
            method: 'setModel',
            model: this.model,
        }));
    }
    async generateSBUWiseSummary() {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Starting SBU-wise summary generation',
                service: 'SummaryService',
                method: 'generateSBUWiseSummary',
            }));
            const sbuData = await this.databaseService.getYearWiseSBUData();
            const jsonData = JSON.stringify(sbuData, null, 2);
            const prompt = (0, index_1.sbuWiseComparisonPrompt)(jsonData);
            const response = await this.anthropic.messages.create({
                model: this.model,
                max_tokens: 12000,
                temperature: 0,
                system: 'You are a helpful AI assistant that specializes in data analysis and audit report generation.',
                messages: [{ role: 'user', content: prompt }],
            });
            let summaryText = '';
            if (response.content && response.content.length > 0) {
                const contentBlock = response.content[0];
                if (contentBlock.type === 'text') {
                    summaryText = contentBlock.text;
                }
            }
            this.loggerService.log(JSON.stringify({
                message: 'SBU-wise summary generated successfully',
                service: 'SummaryService',
                method: 'generateSBUWiseSummary',
                summaryLength: summaryText.length,
            }));
            summaryText = summaryText.replace(/<data_analysis>[\s\S]*?<\/data_analysis>/g, '');
            return summaryText;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error generating SBU-wise summary',
                service: 'SummaryService',
                method: 'generateSBUWiseSummary',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async generateLocationWiseSummary() {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Starting location-wise summary generation',
                service: 'SummaryService',
                method: 'generateLocationWiseSummary',
            }));
            const locationData = await this.databaseService.getYearWiseAuditData();
            const jsonData = JSON.stringify(locationData, null, 2);
            const prompt = (0, index_1.auditWiseComparisonPrompt)(jsonData);
            const response = await this.anthropic.messages.create({
                model: this.model,
                max_tokens: 12000,
                temperature: 0,
                system: 'You are a helpful AI assistant that specializes in data analysis and audit report generation.',
                messages: [{ role: 'user', content: prompt }],
            });
            let summaryText = '';
            if (response.content && response.content.length > 0) {
                const contentBlock = response.content[0];
                if (contentBlock.type === 'text') {
                    summaryText = contentBlock.text;
                }
            }
            this.loggerService.log(JSON.stringify({
                message: 'Location-wise summary generated successfully',
                service: 'SummaryService',
                method: 'generateLocationWiseSummary',
                summaryLength: summaryText.length,
            }));
            summaryText = summaryText.replace(/<data_analysis>[\s\S]*?<\/data_analysis>/g, '');
            this.loggerService.log(JSON.stringify({
                message: 'Cleaned summary text of analysis sections',
                service: 'SummaryService',
                method: 'generateLocationWiseSummary',
                cleanedSummaryLength: summaryText.length,
            }));
            return summaryText;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error generating location-wise summary',
                service: 'SummaryService',
                method: 'generateLocationWiseSummary',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
};
exports.SummaryService = SummaryService;
exports.SummaryService = SummaryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        db_service_1.DatabaseService,
        logger_service_1.LoggerService])
], SummaryService);
//# sourceMappingURL=summary.service.js.map