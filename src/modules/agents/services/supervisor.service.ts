import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@/common/config/services/config.service';
import { ChatAnthropic } from '@langchain/anthropic';
import {
  END,
  Annotation,
  StateGraph,
  START,
  MemorySaver,
} from '@langchain/langgraph';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { z } from 'zod';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { RunnableConfig } from '@langchain/core/runnables';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createCanvas } from 'canvas';
import puppeteer from 'puppeteer';
import { marked } from 'marked';
import { DatabaseService } from '@/common/db/db.service';
import { LoggerService } from '@/common/logger/services/logger.service';

@Injectable()
export class SupervisorService implements OnModuleInit {
  private llm: ChatAnthropic;
  private summarizeAgent: any;
  private chartGenAgent: any;
  private graph: any;
  private readonly pdfOutputPath: string;
  private readonly chartOutputPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {
    this.pdfOutputPath = path.join(process.cwd(), 'files');
    this.chartOutputPath = path.join(process.cwd(), 'files');
  }

  async onModuleInit() {
    try {
      await this.initialize();
      this.loggerService.log(
        JSON.stringify({
          message: 'SupervisorService initialized successfully',
          service: 'SupervisorService',
          method: 'onModuleInit',
        }),
      );
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error initializing SupervisorService',
          service: 'SupervisorService',
          method: 'onModuleInit',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  async initialize() {
    try {
      // Create output directories if they don't exist
      await fs.mkdir(this.pdfOutputPath, { recursive: true });
      await fs.mkdir(this.chartOutputPath, { recursive: true });

      this.loggerService.log(
        JSON.stringify({
          message: 'Output directories created',
          service: 'SupervisorService',
          method: 'initialize',
          paths: {
            pdfOutputPath: this.pdfOutputPath,
            chartOutputPath: this.chartOutputPath,
          },
        }),
      );

      // Initialize LLM
      this.llm = new ChatAnthropic({
        apiKey: this.configService.get('ANTHROPIC_API_KEY'),
        modelName: 'claude-3-7-sonnet-20250219',
        temperature: 0,
      });

      this.loggerService.log(
        JSON.stringify({
          message: 'LLM initialized',
          service: 'SupervisorService',
          method: 'initialize',
          model: 'claude-3-7-sonnet-20250219',
        }),
      );

      // Create agents
      await this.createAgents();

      // Build the workflow graph
      this.graph = await this.createGraph();

      this.loggerService.log(
        JSON.stringify({
          message: 'Initialization complete',
          service: 'SupervisorService',
          method: 'initialize',
        }),
      );
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error in initialization',
          service: 'SupervisorService',
          method: 'initialize',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  private async createAgents() {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Creating agents',
          service: 'SupervisorService',
          method: 'createAgents',
        }),
      );

      // Chart tool implementation
      const chartTool = new DynamicStructuredTool({
        name: 'chart_generator',
        description: 'Generates a bar chart from an array of data points.',
        schema: z.object({
          data: z.array(
            z.object({
              label: z.string(),
              value: z.number(),
            }),
          ),
          title: z.string().describe('The title of the chart'),
        }),
        func: async ({ data, title }) => {
          try {
            this.loggerService.log(
              JSON.stringify({
                message: 'Generating chart',
                service: 'SupervisorService',
                method: 'chartTool.func',
                data: { title, dataPoints: data.length },
              }),
            );

            const width = 500;
            const height = 500;
            const margin = { top: 20, right: 30, bottom: 30, left: 40 };

            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            // Calculate scales manually
            const xLabels = data.map((d) => d.label);
            const maxValue = Math.max(...data.map((d) => d.value));
            const roundedMaxValue = Math.ceil(maxValue / 10) * 10; // Round up to nearest 10

            const barWidth =
              (width - margin.left - margin.right) / xLabels.length - 10;

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

            // Clear canvas
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, width, height);

            // Draw title
            ctx.fillStyle = 'black';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(title, width / 2, margin.top / 2);

            // Draw bars
            data.forEach((d, idx) => {
              const xPos =
                margin.left +
                idx * ((width - margin.left - margin.right) / xLabels.length) +
                5;
              const barHeight =
                ((height - margin.top - margin.bottom) * d.value) /
                roundedMaxValue;
              const yPos = height - margin.bottom - barHeight;

              ctx.fillStyle = colorPalette[idx % colorPalette.length];
              ctx.fillRect(xPos, yPos, barWidth, barHeight);

              // Add value on top of bar
              ctx.fillStyle = 'black';
              ctx.font = '12px Arial';
              ctx.textAlign = 'center';
              ctx.fillText(d.value.toString(), xPos + barWidth / 2, yPos - 5);
            });

            // Draw x-axis
            ctx.beginPath();
            ctx.strokeStyle = 'black';
            ctx.moveTo(margin.left, height - margin.bottom);
            ctx.lineTo(width - margin.right, height - margin.bottom);
            ctx.stroke();

            // X-axis labels
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            xLabels.forEach((label, idx) => {
              const xPos =
                margin.left +
                idx * ((width - margin.left - margin.right) / xLabels.length) +
                barWidth / 2 +
                5;
              ctx.fillText(label, xPos, height - margin.bottom + 6);
            });

            // Draw y-axis
            ctx.beginPath();
            ctx.moveTo(margin.left, margin.top);
            ctx.lineTo(margin.left, height - margin.bottom);
            ctx.stroke();

            // Y-axis labels
            ctx.fillStyle = 'black';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            const numTicks = 5;
            for (let i = 0; i <= numTicks; i++) {
              const value = (roundedMaxValue / numTicks) * i;
              const yPos =
                height -
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

            // Save the chart as PNG
            const buffer = canvas.toBuffer('image/png');
            await fs.writeFile(filePath, buffer);

            this.loggerService.log(
              JSON.stringify({
                message: 'Chart generated successfully',
                service: 'SupervisorService',
                method: 'chartTool.func',
                data: { filename, filePath },
              }),
            );

            return JSON.stringify({
              message: `Chart generated successfully: ${filename}`,
              url: `/files/${filename}`,
              filePath: filePath,
            });
          } catch (error: unknown) {
            this.loggerService.error(
              JSON.stringify({
                message: 'Error generating chart',
                service: 'SupervisorService',
                method: 'chartTool.func',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                data: { title, dataPoints: data?.length },
              }),
            );
            throw new Error(
              `Failed to generate chart: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      });

      // PDF tool implementation
      const pdfTool = new DynamicStructuredTool({
        name: 'pdf_generator',
        description: 'Generates a PDF containing summary and chart',
        schema: z.object({
          summary: z.string().describe('The content to include in the PDF'),
          chartPath: z.string().optional().describe('Path to the chart image'),
          title: z.string().describe('The title of the PDF'),
        }),
        func: async ({ summary, chartPath, title }) => {
          try {
            this.loggerService.log(
              JSON.stringify({
                message: 'Generating PDF',
                service: 'SupervisorService',
                method: 'pdfTool.func',
                data: {
                  title,
                  summaryLength: summary.length,
                  hasChart: !!chartPath,
                  chartPath,
                },
              }),
            );

            const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.pdf`;
            const outputPath = path.join(this.pdfOutputPath, filename);

            // Convert Markdown to HTML
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
                    ${marked(summary)}
                  </div>`;

            // Add chart if provided
            if (chartPath) {
              try {
                // Read the image file as base64
                const imageData = await fs.readFile(chartPath);
                const base64Image = imageData.toString('base64');

                htmlContent += `
                  <div class="chart">
                    <h2>Data Visualization</h2>
                    <img src="data:image/png;base64,${base64Image}" alt="Data Chart">
                  </div>`;

                this.loggerService.log(
                  JSON.stringify({
                    message: 'Chart embedded in PDF',
                    service: 'SupervisorService',
                    method: 'pdfTool.func',
                    data: { chartPath },
                  }),
                );
              } catch (chartError: unknown) {
                this.loggerService.error(
                  JSON.stringify({
                    message: 'Error embedding chart in PDF',
                    service: 'SupervisorService',
                    method: 'pdfTool.func',
                    error:
                      chartError instanceof Error
                        ? chartError.message
                        : String(chartError),
                    data: { chartPath },
                  }),
                );
              }
            }

            htmlContent += `
                </body>
              </html>`;

            this.loggerService.log(
              JSON.stringify({
                message: 'Launching puppeteer',
                service: 'SupervisorService',
                method: 'pdfTool.func',
              }),
            );

            // Launch Puppeteer with stable configuration
            const browser = await puppeteer.launch({
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            const page = await browser.newPage();

            // Set content with longer timeout and wait for network idle
            await page.setContent(htmlContent, {
              waitUntil: ['load', 'networkidle0'],
              timeout: 30000,
            });

            // Generate PDF
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

            this.loggerService.log(
              JSON.stringify({
                message: 'PDF generated successfully',
                service: 'SupervisorService',
                method: 'pdfTool.func',
                data: { filename, outputPath },
              }),
            );

            return JSON.stringify({
              message: `PDF generated successfully: ${filename}`,
              url: `/files/${filename}`,
            });
          } catch (error: unknown) {
            this.loggerService.error(
              JSON.stringify({
                message: 'Error generating PDF',
                service: 'SupervisorService',
                method: 'pdfTool.func',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                data: { title, hasChart: !!chartPath },
              }),
            );
            throw new Error(
              `Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
      });

      // Create summarize agent
      this.summarizeAgent = createReactAgent({
        llm: this.llm,
        tools: [pdfTool],
        prompt: new SystemMessage(
          `
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
          `,
        ),
      });

      // Create chart generation agent
      this.chartGenAgent = createReactAgent({
        llm: this.llm,
        tools: [chartTool, pdfTool],
        prompt: new SystemMessage(
          `You excel at generating bar charts and creating comprehensive reports based on audit data.

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

Always use both tools in sequence - first chart_generator, then pdf_generator - to create a complete report.`,
        ),
      });

      this.loggerService.log(
        JSON.stringify({
          message: 'Agents created successfully',
          service: 'SupervisorService',
          method: 'createAgents',
          agents: ['summarizeAgent', 'chartGenAgent'],
        }),
      );
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error creating agents',
          service: 'SupervisorService',
          method: 'createAgents',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  // Define the state that is passed between nodes
  private AgentState = Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      reducer: (x, y) => x.concat(y),
      default: () => [],
    }),
    next: Annotation<string>({
      reducer: (x, y) => y ?? x ?? END,
      default: () => END,
    }),
  });

  private members = ['chart_generator', 'summarizer'] as const;
  private options = [END, ...this.members];

  private summarizeNode = async (state: any, config?: RunnableConfig) => {
    this.loggerService.log(
      JSON.stringify({
        message: 'Summarize node activated',
        service: 'SupervisorService',
        method: 'summarizeNode',
        data: { messagesCount: state.messages.length },
      }),
    );

    try {
      const result = await this.summarizeAgent.invoke(state, config);
      const lastMessage = result.messages[result.messages.length - 1];

      this.loggerService.log(
        JSON.stringify({
          message: 'Summarize completed task',
          service: 'SupervisorService',
          method: 'summarizeNode',
          data: {
            responseLength: lastMessage.content.length,
            responsePreview: lastMessage.content.substring(0, 100) + '...',
          },
        }),
      );

      return {
        messages: [
          new HumanMessage({
            content: lastMessage.content,
            name: 'Summarizer',
          }),
        ],
      };
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error in summarize node',
          service: 'SupervisorService',
          method: 'summarizeNode',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  };

  private chartGenNode = async (state: any, config?: RunnableConfig) => {
    this.loggerService.log(
      JSON.stringify({
        message: 'Chart generator node activated',
        service: 'SupervisorService',
        method: 'chartGenNode',
        data: { messagesCount: state.messages.length },
      }),
    );

    try {
      const result = await this.chartGenAgent.invoke(state, config);
      const lastMessage = result.messages[result.messages.length - 1];

      this.loggerService.log(
        JSON.stringify({
          message: 'Chart generation completed',
          service: 'SupervisorService',
          method: 'chartGenNode',
          data: {
            responseLength: lastMessage.content.length,
            responsePreview: lastMessage.content.substring(0, 100) + '...',
          },
        }),
      );

      return {
        messages: [
          new HumanMessage({
            content: lastMessage.content,
            name: 'Chart Generator',
          }),
        ],
      };
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error in chart generator node',
          service: 'SupervisorService',
          method: 'chartGenNode',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  };

  private async createSupervisorChain() {
    this.loggerService.log(
      JSON.stringify({
        message: 'Creating supervisor chain',
        service: 'SupervisorService',
        method: 'createSupervisorChain',
      }),
    );

    try {
      const systemPrompt =
        'You are a supervisor tasked with managing a conversation between the' +
        ' following workers: {members}. Given the following user request,' +
        ' respond with the worker to act next. Each worker will perform a' +
        ' task and respond with their results and status. When finished,' +
        ' respond with FINISH.';

      const routingTool = {
        name: 'route',
        description: 'Select the next role.',
        schema: z.object({
          next: z.enum([END, ...this.members]),
        }),
      };

      const prompt = ChatPromptTemplate.fromMessages([
        ['system', systemPrompt],
        new MessagesPlaceholder('messages'),
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
        .pipe(
          this.llm.bindTools([routingTool], {
            tool_choice: 'route',
          }),
        )
        .pipe((x: { tool_calls?: { args: any }[] }) => x.tool_calls?.[0]?.args);

      this.loggerService.log(
        JSON.stringify({
          message: 'Supervisor chain created successfully',
          service: 'SupervisorService',
          method: 'createSupervisorChain',
        }),
      );

      return chain;
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error creating supervisor chain',
          service: 'SupervisorService',
          method: 'createSupervisorChain',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  private async createGraph() {
    this.loggerService.log(
      JSON.stringify({
        message: 'Building workflow graph',
        service: 'SupervisorService',
        method: 'createGraph',
      }),
    );

    try {
      const workflow = new StateGraph(this.AgentState)
        .addNode('chart_generator', this.chartGenNode.bind(this))
        .addNode('summarizer', this.summarizeNode.bind(this))
        .addNode('supervisor', await this.createSupervisorChain());

      this.members.forEach((member) => {
        workflow.addEdge(member, 'supervisor');
      });

      workflow.addConditionalEdges('supervisor', (x: any) => x.next);

      workflow.addEdge(START, 'supervisor');

      const memorySaver = new MemorySaver();

      this.loggerService.log(
        JSON.stringify({
          message: 'Workflow graph built successfully',
          service: 'SupervisorService',
          method: 'createGraph',
        }),
      );

      return workflow.compile({ checkpointer: memorySaver });
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error building workflow graph',
          service: 'SupervisorService',
          method: 'createGraph',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  async run(message: string, threadId: string = 'default') {
    this.loggerService.log(
      JSON.stringify({
        message: 'Starting supervisor run',
        service: 'SupervisorService',
        method: 'run',
        data: {
          messageLength: message.length,
          messagePreview: message.substring(0, 100) + '...',
          threadId,
        },
      }),
    );

    if (!message) {
      const error = new Error('Message is required');
      this.loggerService.error(
        JSON.stringify({
          message: 'Error: Empty message',
          service: 'SupervisorService',
          method: 'run',
          error: error.message,
        }),
      );
      throw error;
    }

    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Invoking graph with message',
          service: 'SupervisorService',
          method: 'run',
          data: { threadId },
        }),
      );

      const result = await this.graph.invoke(
        {
          messages: [new HumanMessage({ content: message })],
        },
        {
          configurable: {
            thread_id: threadId,
          },
        },
      );

      const response = result.messages[result.messages.length - 1].content;

      this.loggerService.log(
        JSON.stringify({
          message: 'Supervisor run completed successfully',
          service: 'SupervisorService',
          method: 'run',
          data: {
            responseLength: response.length,
            responsePreview: response.substring(0, 100) + '...',
            threadId,
          },
        }),
      );

      return response;
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error in supervisor run',
          service: 'SupervisorService',
          method: 'run',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          data: { threadId },
        }),
      );
      throw error;
    }
  }

  async getAuditReport(query: string, threadId: string = 'default') {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Getting audit report',
          service: 'SupervisorService',
          method: 'getAuditReport',
          data: {
            queryLength: query.length,
            queryPreview: query.substring(0, 100) + '...',
            threadId,
          },
        }),
      );

      const data = await this.databaseService.getAIAuditProgressData();

      this.loggerService.log(
        JSON.stringify({
          message: 'Retrieved audit data',
          service: 'SupervisorService',
          method: 'getAuditReport',
          data: {
            dataSize: JSON.stringify(data.data.slice(0, 50)).length,
            recordCount: data?.data?.length || 0,
          },
        }),
      );

      // Then use the supervisor to generate a report with charts
      const supervisorPrompt = `
    ${JSON.stringify(data.data.slice(0, 50))}
    
    Based on this data, generate a comprehensive audit progress report without charts: ${query}
        `;
        

      return await this.run(supervisorPrompt, threadId);
      //   return data;
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error in getAuditReport',
          service: 'SupervisorService',
          method: 'getAuditReport',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          data: { threadId },
        }),
      );
      throw new HttpException(
        'Error in getAuditReport',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
