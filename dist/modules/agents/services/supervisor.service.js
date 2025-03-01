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
exports.SupervisorService = void 0;
const common_1 = require("@nestjs/common");
const config_service_1 = require("../../../common/config/services/config.service");
const path = require("path");
const fs = require("fs/promises");
const puppeteer_1 = require("puppeteer");
const marked_1 = require("marked");
const langgraph_1 = require("@langchain/langgraph");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const tools_1 = require("@langchain/core/tools");
const zod_1 = require("zod");
const anthropic_1 = require("@langchain/anthropic");
const db_service_1 = require("../../../common/db/db.service");
const logger_service_1 = require("../../../common/logger/services/logger.service");
const index_1 = require("../../../prompts/index");
const langgraph_2 = require("@langchain/langgraph");
const prompts_1 = require("@langchain/core/prompts");
let SupervisorService = class SupervisorService {
    constructor(configService, databaseService, loggerService) {
        this.configService = configService;
        this.databaseService = databaseService;
        this.loggerService = loggerService;
        this.members = ['summarizer'];
        this.pdfOutputPath = path.join(process.cwd(), 'files');
        this.chartOutputPath = path.join(process.cwd(), 'files');
        this.AgentState = langgraph_1.Annotation.Root({
            messages: (0, langgraph_1.Annotation)({
                reducer: (x, y) => x.concat(y),
                default: () => [],
            }),
            next: (0, langgraph_1.Annotation)({
                reducer: (x, y) => y ?? x ?? langgraph_1.END,
                default: () => langgraph_1.END,
            }),
        });
    }
    async onModuleInit() {
        try {
            await this.initialize();
            this.loggerService.log(JSON.stringify({
                message: 'SupervisorService initialized successfully',
                service: 'SupervisorService',
                method: 'onModuleInit',
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error initializing SupervisorService',
                service: 'SupervisorService',
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
                service: 'SupervisorService',
                method: 'initialize',
                paths: {
                    pdfOutputPath: this.pdfOutputPath,
                    chartOutputPath: this.chartOutputPath,
                },
            }));
            this.llm = new anthropic_1.ChatAnthropic({
                apiKey: this.configService.get('ANTHROPIC_API_KEY'),
                modelName: this.configService.get('AI_MODEL'),
                temperature: 0,
            });
            this.loggerService.log(JSON.stringify({
                message: 'LLM initialized',
                service: 'SupervisorService',
                method: 'initialize',
                model: this.configService.get('AI_MODEL'),
            }));
            await this.createAgents();
            await this.createSupervisor();
            this.loggerService.log(JSON.stringify({
                message: 'Initialization complete',
                service: 'SupervisorService',
                method: 'initialize',
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error in initialization',
                service: 'SupervisorService',
                method: 'initialize',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async createAgents() {
        try {
            await this.createSummarizeAgent();
            this.loggerService.log(JSON.stringify({
                message: 'Agents created successfully',
                service: 'SupervisorService',
                method: 'createAgents',
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error creating agents',
                service: 'SupervisorService',
                method: 'createAgents',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async createSummarizeAgent() {
        try {
            const pdfGeneratorTool = (0, tools_1.tool)(async (input) => {
                try {
                    const { content } = input;
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
                        service: 'SupervisorService',
                        method: 'pdfGeneratorTool',
                        filename,
                        outputPath,
                    }));
                    const fileUrl = await this.getFileUrl(filename);
                    return `PDF generated successfully, file URL: ${fileUrl}`;
                }
                catch (error) {
                    this.loggerService.error(JSON.stringify({
                        message: 'Error generating PDF',
                        service: 'SupervisorService',
                        method: 'pdfGeneratorTool',
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                    }));
                    throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`);
                }
            }, {
                name: 'pdf_generator',
                description: 'Generate a PDF document from markdown content',
                schema: zod_1.z.object({
                    content: zod_1.z
                        .string()
                        .describe('The markdown content to convert to PDF'),
                    title: zod_1.z.string().describe('The title of the PDF document'),
                }),
            });
            this.summarizeAgent = (0, prebuilt_1.createReactAgent)({
                llm: this.llm,
                tools: [pdfGeneratorTool],
                prompt: `
Always provide the markdown content to the pdf_generator tool.
Always use the pdf_generator tool to generate a PDF document from the markdown content.
        `,
            });
            this.members = ['summarizer'];
            this.loggerService.log(JSON.stringify({
                message: 'Summarize agent created successfully',
                service: 'SupervisorService',
                method: 'createSummarizeAgent',
            }));
            return this.summarizeAgent;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error creating summarize agent',
                service: 'SupervisorService',
                method: 'createSummarizeAgent',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async createSupervisor() {
        try {
            if (!this.summarizeAgent) {
                throw new Error('Summarize agent not initialized');
            }
            this.loggerService.log(JSON.stringify({
                message: 'Starting supervisor creation',
                service: 'SupervisorService',
                method: 'createSupervisor',
            }));
            const systemPrompt = 'You are a supervisor tasked with managing a conversation between the' +
                ' following workers: {members}. Given the following user request,' +
                ' respond with the worker to act next. Each worker will perform a' +
                ' task and respond with their results and status. When finished,' +
                ' respond with FINISH.';
            const options = [langgraph_1.END, ...this.members];
            const checkpointer = new langgraph_2.MemorySaver();
            const routingTool = {
                name: 'route',
                description: 'Select the next role.',
                schema: zod_1.z.object({
                    next: zod_1.z.enum([langgraph_1.END, ...this.members]),
                }),
            };
            const prompt = prompts_1.ChatPromptTemplate.fromMessages([
                ['system', systemPrompt],
                new prompts_1.MessagesPlaceholder('messages'),
                [
                    'human',
                    'Given the conversation above, who should act next?' +
                        ' Or should we FINISH? Select one of: {options}',
                ],
            ]);
            const formattedPrompt = await prompt.partial({
                options: options.join(', '),
                members: this.members.join(', '),
            });
            const supervisorChain = formattedPrompt
                .pipe(this.llm.bindTools([routingTool], {
                tool_choice: 'route',
            }))
                .pipe((x) => x.tool_calls[0].args);
            if (!this.AgentState) {
                throw new Error('AgentState not initialized');
            }
            this.loggerService.log(JSON.stringify({
                message: 'Creating workflow graph',
                service: 'SupervisorService',
                method: 'createSupervisor',
                members: this.members,
            }));
            const workflow = new langgraph_1.StateGraph(this.AgentState)
                .addNode('summarizer', this.summarizeAgent)
                .addNode('supervisor', supervisorChain);
            this.members.forEach((member) => {
                workflow.addEdge(member, 'supervisor');
            });
            workflow.addConditionalEdges('supervisor', (x) => x.next);
            workflow.addEdge(langgraph_1.START, 'supervisor');
            this.loggerService.log(JSON.stringify({
                message: 'Compiling workflow graph',
                service: 'SupervisorService',
                method: 'createSupervisor',
            }));
            const graph = workflow.compile({
                checkpointer,
            });
            this.supervisor = graph;
            this.loggerService.log(JSON.stringify({
                message: 'Supervisor created successfully',
                service: 'SupervisorService',
                method: 'createSupervisor',
            }));
            return 'Compiled supervisor';
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error creating supervisor',
                service: 'SupervisorService',
                method: 'createSupervisor',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async generateSummaryReport(content, threadId = 'default') {
        try {
            if (!this.summarizeAgent) {
                throw new Error('Summarize agent not initialized');
            }
            this.loggerService.log(JSON.stringify({
                message: 'Starting summary report generation',
                service: 'SupervisorService',
                method: 'generateSummaryReport',
                contentLength: content.length,
                threadId,
            }));
            const result = await this.supervisor.invoke({
                messages: [
                    {
                        role: 'user',
                        content: content,
                    },
                ],
            }, {
                configurable: {
                    thread_id: threadId,
                },
                recursionLimit: 30,
            });
            this.loggerService.log(JSON.stringify({
                message: 'Summary report generated successfully',
                service: 'SupervisorService',
                method: 'generateSummaryReport',
                messageCount: result.messages.length,
                resultLength: result.messages[result.messages.length - 1].content.length,
            }));
            return result.messages[result.messages.length - 1].content;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error generating summary report',
                service: 'SupervisorService',
                method: 'generateSummaryReport',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                threadId,
            }));
            throw new common_1.HttpException(`Failed to generate summary report: ${error instanceof Error ? error.message : String(error)}`, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async run(task, threadId = 'default') {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Starting report generation',
                service: 'SupervisorService',
                method: 'run',
                task,
                threadId,
            }));
            const auditData = await this.databaseService.getAIAuditProgressData();
            this.loggerService.log(JSON.stringify({
                message: 'Retrieved audit data',
                service: 'SupervisorService',
                method: 'run',
                dataCount: auditData.length,
                sampleCount: Math.min(20, auditData.length),
            }));
            const content = (0, index_1.supervisorSummaryAgentPrompt)(JSON.stringify(auditData), task || 'Create a detailed summary report of the audit data', new Date().toISOString().split('T')[0]);
            this.loggerService.log(JSON.stringify({
                message: 'Prepared content for summary generation',
                service: 'SupervisorService',
                method: 'run',
                contentLength: content.length,
                task: task || 'Create a detailed summary report of the audit data',
            }));
            const result = await this.generateSummaryReport(content, threadId);
            this.loggerService.log(JSON.stringify({
                message: 'Summary report generated successfully',
                service: 'SupervisorService',
                method: 'run',
                resultLength: result.length,
            }));
            return result;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Failed to generate summary report',
                service: 'SupervisorService',
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
                service: 'SupervisorService',
                method: 'getFileUrl',
                filename,
                path: filePath,
            }));
            return `${this.configService.get('APP_URL')}/files/${filename}`;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'File not found',
                service: 'SupervisorService',
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
                service: 'SupervisorService',
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
                        service: 'SupervisorService',
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
                service: 'SupervisorService',
                method: 'getAllReports',
                totalFiles: files.length,
                validFiles: validResults.length,
            }));
            return validResults;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error reading reports directory',
                service: 'SupervisorService',
                method: 'getAllReports',
                error: error instanceof Error ? error.message : String(error),
            }));
            throw error;
        }
    }
};
exports.SupervisorService = SupervisorService;
exports.SupervisorService = SupervisorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_service_1.ConfigService,
        db_service_1.DatabaseService,
        logger_service_1.LoggerService])
], SupervisorService);
//# sourceMappingURL=supervisor.service.js.map