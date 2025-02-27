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
const anthropic_1 = require("@langchain/anthropic");
const langgraph_1 = require("@langchain/langgraph");
const messages_1 = require("@langchain/core/messages");
const zod_1 = require("zod");
const prompts_1 = require("@langchain/core/prompts");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const path = require("path");
const fs = require("fs/promises");
const tools_1 = require("@langchain/core/tools");
const canvas_1 = require("canvas");
const puppeteer_1 = require("puppeteer");
const marked_1 = require("marked");
const db_service_1 = require("../../../common/db/db.service");
const logger_service_1 = require("../../../common/logger/services/logger.service");
let SupervisorService = class SupervisorService {
    constructor(configService, databaseService, loggerService) {
        this.configService = configService;
        this.databaseService = databaseService;
        this.loggerService = loggerService;
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
        this.members = ['chart_generator', 'summarizer'];
        this.options = [langgraph_1.END, ...this.members];
        this.summarizeNode = async (state, config) => {
            this.loggerService.log(JSON.stringify({
                message: 'Summarize node activated',
                service: 'SupervisorService',
                method: 'summarizeNode',
                data: { messagesCount: state.messages.length },
            }));
            try {
                const result = await this.summarizeAgent.invoke(state, config);
                const lastMessage = result.messages[result.messages.length - 1];
                this.loggerService.log(JSON.stringify({
                    message: 'Summarize completed task',
                    service: 'SupervisorService',
                    method: 'summarizeNode',
                    data: {
                        responseLength: lastMessage.content.length,
                        responsePreview: lastMessage.content.substring(0, 100) + '...',
                    },
                }));
                return {
                    messages: [
                        new messages_1.HumanMessage({
                            content: lastMessage.content,
                            name: 'Summarizer',
                        }),
                    ],
                };
            }
            catch (error) {
                this.loggerService.error(JSON.stringify({
                    message: 'Error in summarize node',
                    service: 'SupervisorService',
                    method: 'summarizeNode',
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                }));
                throw error;
            }
        };
        this.chartGenNode = async (state, config) => {
            this.loggerService.log(JSON.stringify({
                message: 'Chart generator node activated',
                service: 'SupervisorService',
                method: 'chartGenNode',
                data: { messagesCount: state.messages.length },
            }));
            try {
                const result = await this.chartGenAgent.invoke(state, config);
                const lastMessage = result.messages[result.messages.length - 1];
                this.loggerService.log(JSON.stringify({
                    message: 'Chart generation completed',
                    service: 'SupervisorService',
                    method: 'chartGenNode',
                    data: {
                        responseLength: lastMessage.content.length,
                        responsePreview: lastMessage.content.substring(0, 100) + '...',
                    },
                }));
                return {
                    messages: [
                        new messages_1.HumanMessage({
                            content: lastMessage.content,
                            name: 'Chart Generator',
                        }),
                    ],
                };
            }
            catch (error) {
                this.loggerService.error(JSON.stringify({
                    message: 'Error in chart generator node',
                    service: 'SupervisorService',
                    method: 'chartGenNode',
                    error: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                }));
                throw error;
            }
        };
        this.pdfOutputPath = path.join(process.cwd(), 'files');
        this.chartOutputPath = path.join(process.cwd(), 'files');
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
                modelName: 'claude-3-7-sonnet-20250219',
                temperature: 0,
            });
            this.loggerService.log(JSON.stringify({
                message: 'LLM initialized',
                service: 'SupervisorService',
                method: 'initialize',
                model: 'claude-3-7-sonnet-20250219',
            }));
            await this.createAgents();
            this.graph = await this.createGraph();
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
            this.loggerService.log(JSON.stringify({
                message: 'Creating agents',
                service: 'SupervisorService',
                method: 'createAgents',
            }));
            const chartTool = new tools_1.DynamicStructuredTool({
                name: 'chart_generator',
                description: 'Generates a bar chart from an array of data points.',
                schema: zod_1.z.object({
                    data: zod_1.z.array(zod_1.z.object({
                        label: zod_1.z.string(),
                        value: zod_1.z.number(),
                    })),
                    title: zod_1.z.string().describe('The title of the chart'),
                }),
                func: async ({ data, title }) => {
                    try {
                        this.loggerService.log(JSON.stringify({
                            message: 'Generating chart',
                            service: 'SupervisorService',
                            method: 'chartTool.func',
                            data: { title, dataPoints: data.length },
                        }));
                        const width = 500;
                        const height = 500;
                        const margin = { top: 20, right: 30, bottom: 30, left: 40 };
                        const canvas = (0, canvas_1.createCanvas)(width, height);
                        const ctx = canvas.getContext('2d');
                        const xLabels = data.map((d) => d.label);
                        const maxValue = Math.max(...data.map((d) => d.value));
                        const roundedMaxValue = Math.ceil(maxValue / 10) * 10;
                        const barWidth = (width - margin.left - margin.right) / xLabels.length - 10;
                        const colorPalette = [
                            '#e6194B',
                            '#3cb44b',
                            '#ffe119',
                            '#4363d8',
                            '#f58231',
                            '#911eb4',
                            '#42d4f4',
                            '#f032e6',
                            '#bfef45',
                            '#fabebe',
                        ];
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, width, height);
                        ctx.fillStyle = 'black';
                        ctx.font = 'bold 16px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(title, width / 2, margin.top / 2);
                        data.forEach((d, idx) => {
                            const xPos = margin.left +
                                idx * ((width - margin.left - margin.right) / xLabels.length) +
                                5;
                            const barHeight = ((height - margin.top - margin.bottom) * d.value) /
                                roundedMaxValue;
                            const yPos = height - margin.bottom - barHeight;
                            ctx.fillStyle = colorPalette[idx % colorPalette.length];
                            ctx.fillRect(xPos, yPos, barWidth, barHeight);
                            ctx.fillStyle = 'black';
                            ctx.font = '12px Arial';
                            ctx.textAlign = 'center';
                            ctx.fillText(d.value.toString(), xPos + barWidth / 2, yPos - 5);
                        });
                        ctx.beginPath();
                        ctx.strokeStyle = 'black';
                        ctx.moveTo(margin.left, height - margin.bottom);
                        ctx.lineTo(width - margin.right, height - margin.bottom);
                        ctx.stroke();
                        ctx.fillStyle = 'black';
                        ctx.font = '12px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        xLabels.forEach((label, idx) => {
                            const xPos = margin.left +
                                idx * ((width - margin.left - margin.right) / xLabels.length) +
                                barWidth / 2 +
                                5;
                            ctx.fillText(label, xPos, height - margin.bottom + 6);
                        });
                        ctx.beginPath();
                        ctx.moveTo(margin.left, margin.top);
                        ctx.lineTo(margin.left, height - margin.bottom);
                        ctx.stroke();
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'right';
                        ctx.textBaseline = 'middle';
                        const numTicks = 5;
                        for (let i = 0; i <= numTicks; i++) {
                            const value = (roundedMaxValue / numTicks) * i;
                            const yPos = height -
                                margin.bottom -
                                ((height - margin.top - margin.bottom) * value) /
                                    roundedMaxValue;
                            ctx.beginPath();
                            ctx.moveTo(margin.left, yPos);
                            ctx.lineTo(margin.left - 6, yPos);
                            ctx.stroke();
                            ctx.fillText(value.toString(), margin.left - 8, yPos);
                        }
                        const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.png`;
                        const filePath = path.join(this.chartOutputPath, filename);
                        const buffer = canvas.toBuffer('image/png');
                        await fs.writeFile(filePath, buffer);
                        this.loggerService.log(JSON.stringify({
                            message: 'Chart generated successfully',
                            service: 'SupervisorService',
                            method: 'chartTool.func',
                            data: { filename, filePath },
                        }));
                        return JSON.stringify({
                            message: `Chart generated successfully: ${filename}`,
                            url: `/files/${filename}`,
                            filePath: filePath,
                        });
                    }
                    catch (error) {
                        this.loggerService.error(JSON.stringify({
                            message: 'Error generating chart',
                            service: 'SupervisorService',
                            method: 'chartTool.func',
                            error: error instanceof Error ? error.message : String(error),
                            stack: error instanceof Error ? error.stack : undefined,
                            data: { title, dataPoints: data?.length },
                        }));
                        throw new Error(`Failed to generate chart: ${error instanceof Error ? error.message : String(error)}`);
                    }
                },
            });
            const pdfTool = new tools_1.DynamicStructuredTool({
                name: 'pdf_generator',
                description: 'Generates a PDF containing summary and chart',
                schema: zod_1.z.object({
                    summary: zod_1.z.string().describe('The content to include in the PDF'),
                    chartPath: zod_1.z.string().optional().describe('Path to the chart image'),
                    title: zod_1.z.string().describe('The title of the PDF'),
                }),
                func: async ({ summary, chartPath, title }) => {
                    try {
                        this.loggerService.log(JSON.stringify({
                            message: 'Generating PDF',
                            service: 'SupervisorService',
                            method: 'pdfTool.func',
                            data: {
                                title,
                                summaryLength: summary.length,
                                hasChart: !!chartPath,
                                chartPath,
                            },
                        }));
                        const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.pdf`;
                        const outputPath = path.join(this.pdfOutputPath, filename);
                        let htmlContent = `
              <html>
                <head>
                  <style>
                    body { 
                      font-family: Arial, sans-serif; 
                      padding: 20px;
                      max-width: 800px;
                      margin: 0 auto;
                    }
                    h1, h2, h3 { 
                      color: #333;
                      margin-top: 20px;
                    }
                    .summary {
                      margin: 20px 0;
                      line-height: 1.6;
                    }
                    .chart {
                      margin: 20px 0;
                      text-align: center;
                    }
                    .chart img {
                      max-width: 100%;
                      height: auto;
                    }
                  </style>
                </head>
                <body>
                  <h1>${title}</h1>
                  <div class="summary">
                    ${(0, marked_1.marked)(summary)}
                  </div>`;
                        if (chartPath) {
                            try {
                                const imageData = await fs.readFile(chartPath);
                                const base64Image = imageData.toString('base64');
                                htmlContent += `
                  <div class="chart">
                    <h2>Data Visualization</h2>
                    <img src="data:image/png;base64,${base64Image}" alt="Data Chart">
                  </div>`;
                                this.loggerService.log(JSON.stringify({
                                    message: 'Chart embedded in PDF',
                                    service: 'SupervisorService',
                                    method: 'pdfTool.func',
                                    data: { chartPath },
                                }));
                            }
                            catch (chartError) {
                                this.loggerService.error(JSON.stringify({
                                    message: 'Error embedding chart in PDF',
                                    service: 'SupervisorService',
                                    method: 'pdfTool.func',
                                    error: chartError instanceof Error
                                        ? chartError.message
                                        : String(chartError),
                                    data: { chartPath },
                                }));
                            }
                        }
                        htmlContent += `
                </body>
              </html>`;
                        this.loggerService.log(JSON.stringify({
                            message: 'Launching puppeteer',
                            service: 'SupervisorService',
                            method: 'pdfTool.func',
                        }));
                        const browser = await puppeteer_1.default.launch({
                            headless: true,
                            args: ['--no-sandbox', '--disable-setuid-sandbox'],
                        });
                        const page = await browser.newPage();
                        await page.setContent(htmlContent, {
                            waitUntil: ['load', 'networkidle0'],
                            timeout: 30000,
                        });
                        await page.pdf({
                            path: outputPath,
                            format: 'A4',
                            margin: {
                                top: '50px',
                                right: '50px',
                                bottom: '50px',
                                left: '50px',
                            },
                            printBackground: true,
                        });
                        await browser.close();
                        this.loggerService.log(JSON.stringify({
                            message: 'PDF generated successfully',
                            service: 'SupervisorService',
                            method: 'pdfTool.func',
                            data: { filename, outputPath },
                        }));
                        return JSON.stringify({
                            message: `PDF generated successfully: ${filename}`,
                            url: `/files/${filename}`,
                        });
                    }
                    catch (error) {
                        this.loggerService.error(JSON.stringify({
                            message: 'Error generating PDF',
                            service: 'SupervisorService',
                            method: 'pdfTool.func',
                            error: error instanceof Error ? error.message : String(error),
                            stack: error instanceof Error ? error.stack : undefined,
                            data: { title, hasChart: !!chartPath },
                        }));
                        throw new Error(`Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`);
                    }
                },
            });
            this.summarizeAgent = (0, prebuilt_1.createReactAgent)({
                llm: this.llm,
                tools: [pdfTool],
                prompt: new messages_1.SystemMessage(`
I want you to act as a professional report summarizer with expertise in AUDIT PROGRESS REPORT. I will provide you with a detailed report, and your task is to generate a concise and informative summary that captures the essential findings, conclusions, and recommendations.

**Instructions:**

1. **Content Focus:**
   - **Key Findings:** Highlight the most critical insights and data points presented in the report.
   - **Conclusions:** Summarize the main conclusions drawn from the analysis or discussion.
   - **Recommendations:** Outline any proposed actions, strategies, or next steps suggested by the report.

2. **Structure & Format:**
   - **Introduction:** Provide a brief overview of the report's purpose and scope.
   - **Main Body:** Present the key findings, conclusions, and recommendations in a clear and organized manner.
   - **Conclusion:** Offer a succinct summary that encapsulates the overall insights and suggested actions.

3. **Style & Tone:**
   - **Professional and Objective:** Maintain a formal tone, using precise language and avoiding personal bias.
   - **Clarity and Conciseness:** Ensure the summary is easy to understand, avoiding unnecessary jargon and focusing on essential information.

4. **Additional Elements (if applicable):**
   - **Visual Aids:** Suggest any tables, charts, or figures that could enhance the comprehension of the summarized content.
   - **Important Statistics:** Emphasize significant data points or metrics that are pivotal to the report's insights.

NOTE: You MUST use the pdf_generator tool to create a well-formatted PDF with your summary. The PDF should have a clear title and professional formatting.
          `),
            });
            this.chartGenAgent = (0, prebuilt_1.createReactAgent)({
                llm: this.llm,
                tools: [chartTool, pdfTool],
                prompt: new messages_1.SystemMessage(`You excel at generating bar charts and creating comprehensive reports based on audit data.

Your tasks:
1. Analyze the provided audit data to identify key metrics that would benefit from visualization
2. Extract numerical data and create appropriate labels for a bar chart
3. Use the chart_generator tool to create a visual representation of the data
4. After generating a chart, use the pdf_generator tool to create a PDF that combines the summary and chart

When creating charts:
- Choose the most relevant metrics from the audit data
- Format the data as an array of objects with "label" and "value" properties
- Provide a clear, descriptive title for the chart

When creating the final PDF:
- Include a comprehensive summary of the audit findings
- Reference the chart you created and explain its significance
- Provide actionable insights based on the data visualization

Always use both tools in sequence - first chart_generator, then pdf_generator - to create a complete report.`),
            });
            this.loggerService.log(JSON.stringify({
                message: 'Agents created successfully',
                service: 'SupervisorService',
                method: 'createAgents',
                agents: ['summarizeAgent', 'chartGenAgent'],
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
    async createSupervisorChain() {
        this.loggerService.log(JSON.stringify({
            message: 'Creating supervisor chain',
            service: 'SupervisorService',
            method: 'createSupervisorChain',
        }));
        try {
            const systemPrompt = 'You are a supervisor tasked with managing a conversation between the' +
                ' following workers: {members}. Given the following user request,' +
                ' respond with the worker to act next. Each worker will perform a' +
                ' task and respond with their results and status. When finished,' +
                ' respond with FINISH.';
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
                options: this.options.join(', '),
                members: this.members.join(', '),
            });
            const chain = formattedPrompt
                .pipe(this.llm.bindTools([routingTool], {
                tool_choice: 'route',
            }))
                .pipe((x) => x.tool_calls?.[0]?.args);
            this.loggerService.log(JSON.stringify({
                message: 'Supervisor chain created successfully',
                service: 'SupervisorService',
                method: 'createSupervisorChain',
            }));
            return chain;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error creating supervisor chain',
                service: 'SupervisorService',
                method: 'createSupervisorChain',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async createGraph() {
        this.loggerService.log(JSON.stringify({
            message: 'Building workflow graph',
            service: 'SupervisorService',
            method: 'createGraph',
        }));
        try {
            const workflow = new langgraph_1.StateGraph(this.AgentState)
                .addNode('chart_generator', this.chartGenNode.bind(this))
                .addNode('summarizer', this.summarizeNode.bind(this))
                .addNode('supervisor', await this.createSupervisorChain());
            this.members.forEach((member) => {
                workflow.addEdge(member, 'supervisor');
            });
            workflow.addConditionalEdges('supervisor', (x) => x.next);
            workflow.addEdge(langgraph_1.START, 'supervisor');
            const memorySaver = new langgraph_1.MemorySaver();
            this.loggerService.log(JSON.stringify({
                message: 'Workflow graph built successfully',
                service: 'SupervisorService',
                method: 'createGraph',
            }));
            return workflow.compile({ checkpointer: memorySaver });
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error building workflow graph',
                service: 'SupervisorService',
                method: 'createGraph',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async run(message, threadId = 'default') {
        this.loggerService.log(JSON.stringify({
            message: 'Starting supervisor run',
            service: 'SupervisorService',
            method: 'run',
            data: {
                messageLength: message.length,
                messagePreview: message.substring(0, 100) + '...',
                threadId,
            },
        }));
        if (!message) {
            const error = new Error('Message is required');
            this.loggerService.error(JSON.stringify({
                message: 'Error: Empty message',
                service: 'SupervisorService',
                method: 'run',
                error: error.message,
            }));
            throw error;
        }
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Invoking graph with message',
                service: 'SupervisorService',
                method: 'run',
                data: { threadId },
            }));
            const result = await this.graph.invoke({
                messages: [new messages_1.HumanMessage({ content: message })],
            }, {
                configurable: {
                    thread_id: threadId,
                },
            });
            const response = result.messages[result.messages.length - 1].content;
            this.loggerService.log(JSON.stringify({
                message: 'Supervisor run completed successfully',
                service: 'SupervisorService',
                method: 'run',
                data: {
                    responseLength: response.length,
                    responsePreview: response.substring(0, 100) + '...',
                    threadId,
                },
            }));
            return response;
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error in supervisor run',
                service: 'SupervisorService',
                method: 'run',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                data: { threadId },
            }));
            throw error;
        }
    }
    async getAuditReport(query, threadId = 'default') {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Getting audit report',
                service: 'SupervisorService',
                method: 'getAuditReport',
                data: {
                    queryLength: query.length,
                    queryPreview: query.substring(0, 100) + '...',
                    threadId,
                },
            }));
            const data = await this.databaseService.getAIAuditProgressData();
            this.loggerService.log(JSON.stringify({
                message: 'Retrieved audit data',
                service: 'SupervisorService',
                method: 'getAuditReport',
                data: {
                    dataSize: JSON.stringify(data.data.slice(0, 50)).length,
                    recordCount: data?.data?.length || 0,
                },
            }));
            const supervisorPrompt = `
    ${JSON.stringify(data.data.slice(0, 50))}
    
    Based on this data, generate a comprehensive audit progress report without charts: ${query}
        `;
            return await this.run(supervisorPrompt, threadId);
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error in getAuditReport',
                service: 'SupervisorService',
                method: 'getAuditReport',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                data: { threadId },
            }));
            throw new common_1.HttpException('Error in getAuditReport', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
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