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
exports.SupervisorV2Service = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../../common/config/services/config.service");
const path = require("path");
const fs = require("fs/promises");
const puppeteer_1 = require("puppeteer");
const marked_1 = require("marked");
const sdk_1 = require("@anthropic-ai/sdk");
const db_service_1 = require("../../../common/db/db.service");
const logger_service_1 = require("../../../common/logger/services/logger.service");
const index_1 = require("../../../prompts/index");
let SupervisorV2Service = class SupervisorV2Service {
    constructor(configService, databaseService, loggerService) {
        this.configService = configService;
        this.databaseService = databaseService;
        this.loggerService = loggerService;
        this.pdfOutputPath = path.join(process.cwd(), 'files');
        this.chartOutputPath = path.join(process.cwd(), 'files');
        this.model =
            this.configService.get('AI_MODEL') || 'claude-3-sonnet-20240229';
    }
    async onModuleInit() {
        try {
            await this.initialize();
            this.loggerService.log(JSON.stringify({
                message: 'SupervisorV2Service initialized successfully',
                service: 'SupervisorV2Service',
                method: 'onModuleInit',
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error initializing SupervisorV2Service',
                service: 'SupervisorV2Service',
                method: 'onModuleInit',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async initialize() {
        try {
            await fs.mkdir(this.pdfOutputPath, { recursive: true });
            await fs.mkdir(this.chartOutputPath, { recursive: true });
            this.loggerService.log(JSON.stringify({
                message: 'Output directories created',
                service: 'SupervisorV2Service',
                method: 'initialize',
                paths: {
                    pdfOutputPath: this.pdfOutputPath,
                    chartOutputPath: this.chartOutputPath,
                },
            }));
            this.anthropic = new sdk_1.default({
                apiKey: this.configService.get('ANTHROPIC_API_KEY'),
            });
            this.loggerService.log(JSON.stringify({
                message: 'Anthropic client initialized',
                service: 'SupervisorV2Service',
                method: 'initialize',
                model: this.model,
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error in initialization',
                service: 'SupervisorV2Service',
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
            service: 'SupervisorV2Service',
            method: 'setModel',
            model: this.model,
        }));
    }
    async generateSummaryReport(content, threadId = 'default') {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Starting summary report generation',
                service: 'SupervisorV2Service',
                method: 'generateSummaryReport',
                contentLength: content.length,
                threadId,
            }));
            const analysisPrompt = `
You are a data analysis expert. Analyze the following data and create a comprehensive summary:

${content}

Your analysis should include:
1. Key findings and insights
2. Important patterns or trends
3. Recommendations based on the data
4. Any anomalies or areas of concern

Format your response as detailed markdown that can be converted to a professional PDF report.
`;
            const analysisResponse = await this.anthropic.messages.create({
                model: this.model,
                max_tokens: 16000,
                temperature: 0,
                system: 'You are a helpful AI assistant that specializes in data analysis and report generation.',
                messages: [{ role: 'user', content: analysisPrompt }],
            });
            let markdownContent = '';
            if (analysisResponse.content && analysisResponse.content.length > 0) {
                const contentBlock = analysisResponse.content[0];
                if (contentBlock.type === 'text') {
                    markdownContent = contentBlock.text;
                }
                else if (contentBlock.type === 'tool_use') {
                    this.loggerService.log(JSON.stringify({
                        message: 'Received tool_use block instead of text',
                        service: 'SupervisorV2Service',
                        method: 'generateSummaryReport',
                        toolUse: contentBlock.name,
                    }));
                    markdownContent = `Tool Use Response: ${contentBlock.name}`;
                }
                else {
                    this.loggerService.log(JSON.stringify({
                        message: 'Received unexpected content block type',
                        service: 'SupervisorV2Service',
                        method: 'generateSummaryReport',
                        blockType: contentBlock.type,
                    }));
                    markdownContent =
                        'Unexpected response format received from AI model.';
                }
            }
            else {
                this.loggerService.error(JSON.stringify({
                    message: 'No content received from AI model',
                    service: 'SupervisorV2Service',
                    method: 'generateSummaryReport',
                }));
                throw new Error('No content received from AI model');
            }
            const pdfResult = await this.generatePDF(markdownContent);
            this.loggerService.log(JSON.stringify({
                message: 'Summary report generated successfully',
                service: 'SupervisorV2Service',
                method: 'generateSummaryReport',
                resultLength: markdownContent.length,
            }));
            return {
                content: markdownContent,
                pdf: pdfResult,
            };
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error generating summary report',
                service: 'SupervisorV2Service',
                method: 'generateSummaryReport',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                threadId,
            }));
            throw new common_1.HttpException(`Failed to generate summary report: ${error instanceof Error ? error.message : String(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async generatePDF(content) {
        try {
            const timestamp = new Date().getTime();
            const filename = `audit_summary_report_${timestamp}.pdf`;
            const outputPath = path.join(this.pdfOutputPath, filename);
            const html = marked_1.marked.parse(content);
            const browser = await puppeteer_1.default.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            const page = await browser.newPage();
            await page.setContent(`
        <html>
          <title>Audit Report(${new Date().toISOString().split('T')[0]})</title>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 40px;
                line-height: 1.6;
              }
              h1 {
                color: #333;
                border-bottom: 1px solid #ddd;
                padding-bottom: 10px;
              }
              h2 {
                color: #444;
                margin-top: 20px;
              }
              p {
                margin-bottom: 16px;
              }
              ul, ol {
                margin-bottom: 16px;
              }
            </style>
          </head>
          <body>
            ${html}
          </body>
        </html>
      `);
            await page.pdf({
                path: outputPath,
                format: 'A4',
                margin: {
                    top: '10px',
                    right: '20px',
                    bottom: '10px',
                    left: '10px',
                },
            });
            await browser.close();
            this.loggerService.log(JSON.stringify({
                message: 'PDF generated successfully',
                service: 'SupervisorV2Service',
                method: 'generatePDF',
                filename,
                outputPath,
            }));
            const fileUrl = await this.getFileUrl(filename);
            return fileUrl;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error generating PDF',
                service: 'SupervisorV2Service',
                method: 'generatePDF',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async run(task, threadId = 'default') {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Starting report generation',
                service: 'SupervisorV2Service',
                method: 'run',
                task,
                threadId,
            }));
            const auditData = await this.databaseService.getAIAuditProgressData();
            this.loggerService.log(JSON.stringify({
                message: 'Retrieved audit data',
                service: 'SupervisorV2Service',
                method: 'run',
                dataCount: auditData.length,
                sampleCount: Math.min(20, auditData.length),
            }));
            const content = (0, index_1.supervisorSummaryAgentPrompt)(JSON.stringify(auditData.slice(0, 10)), task || 'Create a detailed summary report of the audit data', new Date().toISOString().split('T')[0]);
            this.loggerService.log(JSON.stringify({
                message: 'Prepared content for summary generation',
                service: 'SupervisorV2Service',
                method: 'run',
                contentLength: content.length,
                task: task || 'Create a detailed summary report of the audit data',
            }));
            const result = await this.generateSummaryReport(content, threadId);
            this.loggerService.log(JSON.stringify({
                message: 'Summary report generated successfully',
                service: 'SupervisorV2Service',
                method: 'run',
                resultLength: result.content.length,
            }));
            return result;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Failed to generate summary report',
                service: 'SupervisorV2Service',
                method: 'run',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                task,
                threadId,
            }));
            throw new common_1.HttpException(`Failed to generate summary report: ${error instanceof Error ? error.message : String(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getFileUrl(filename) {
        try {
            const filePath = path.join(this.pdfOutputPath, filename);
            await fs.access(filePath);
            this.loggerService.log(JSON.stringify({
                message: 'File found',
                service: 'SupervisorV2Service',
                method: 'getFileUrl',
                filename,
                path: filePath,
            }));
            return `${this.configService.get('APP_URL')}/files/${filename}`;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'File not found',
                service: 'SupervisorV2Service',
                method: 'getFileUrl',
                filename,
                error: error instanceof Error ? error.message : String(error),
            }));
            throw new common_1.HttpException(`File not found: ${filename}`, common_1.HttpStatus.NOT_FOUND);
        }
    }
    async getAllReports() {
        try {
            const files = await fs.readdir(this.pdfOutputPath);
            this.loggerService.log(JSON.stringify({
                message: 'Retrieved all report files',
                service: 'SupervisorV2Service',
                method: 'getAllReports',
                fileCount: files.length,
                files,
            }));
            const filePromises = files.map(async (file) => {
                try {
                    const url = await this.getFileUrl(file);
                    const timestampMatch = file.match(/\d+/);
                    const timestamp = timestampMatch
                        ? parseInt(timestampMatch[0], 10)
                        : 0;
                    return {
                        filename: file,
                        url,
                        createdAt: new Date(timestamp).toISOString(),
                    };
                }
                catch (error) {
                    this.loggerService.error(JSON.stringify({
                        message: 'Error getting URL for file',
                        service: 'SupervisorV2Service',
                        method: 'getAllReports',
                        filename: file,
                        error: error instanceof Error ? error.message : String(error),
                    }));
                    return null;
                }
            });
            const results = await Promise.all(filePromises);
            const validResults = results.filter(Boolean);
            this.loggerService.log(JSON.stringify({
                message: 'Processed all report files',
                service: 'SupervisorV2Service',
                method: 'getAllReports',
                totalFiles: files.length,
                validFiles: validResults.length,
            }));
            return validResults;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error reading reports directory',
                service: 'SupervisorV2Service',
                method: 'getAllReports',
                error: error instanceof Error ? error.message : String(error),
            }));
            throw error;
        }
    }
};
exports.SupervisorV2Service = SupervisorV2Service;
exports.SupervisorV2Service = SupervisorV2Service = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        db_service_1.DatabaseService,
        logger_service_1.LoggerService])
], SupervisorV2Service);
//# sourceMappingURL=supervisor-v2.service.js.map