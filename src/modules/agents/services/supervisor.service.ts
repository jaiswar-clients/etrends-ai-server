import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@/common/config/services/config.service';

import * as path from 'path';
import * as fs from 'fs/promises';
import puppeteer from 'puppeteer';
import { marked } from 'marked';

import {
  END,
  Annotation,
  StateGraph,
  AnnotationRoot,
  BinaryOperatorAggregate,
  START,
  CompiledGraph,
} from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { ChatAnthropic } from '@langchain/anthropic';
import { DatabaseService } from '@/common/db/db.service';
import { LoggerService } from '@/common/logger/services/logger.service';
import { SystemMessage } from '@langchain/core/messages';
import { supervisorSummaryAgentPrompt } from '@/prompts/index';
import { MemorySaver } from '@langchain/langgraph';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';

@Injectable()
export class SupervisorService implements OnModuleInit {
  private llm: ChatAnthropic;
  private summarizeAgent: any;
  private supervisor: CompiledGraph<any, any, any, any, any, any>;
  private readonly pdfOutputPath: string;
  private readonly chartOutputPath: string;

  private AgentState: AnnotationRoot<{
    messages: BinaryOperatorAggregate<BaseMessage[], BaseMessage[]>;
    next: BinaryOperatorAggregate<string, string>;
  }>;
  private members: string[] = ['summarizer'];

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {
    this.pdfOutputPath = path.join(process.cwd(), 'files');
    this.chartOutputPath = path.join(process.cwd(), 'files');
    this.AgentState = Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
        default: () => [],
      }),
      // The agent node that last performed work
      next: Annotation<string>({
        reducer: (x, y) => y ?? x ?? END,
        default: () => END,
      }),
    });
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
        modelName: this.configService.get('AI_MODEL'),
        temperature: 0,
      });

      this.loggerService.log(
        JSON.stringify({
          message: 'LLM initialized',
          service: 'SupervisorService',
          method: 'initialize',
          model: this.configService.get('AI_MODEL'),
        }),
      );

      // Create agents
      await this.createAgents();

      // Build the workflow graph
      await this.createSupervisor();

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

  async createAgents() {
    try {
      // Create the summarize agent
      await this.createSummarizeAgent();

      this.loggerService.log(
        JSON.stringify({
          message: 'Agents created successfully',
          service: 'SupervisorService',
          method: 'createAgents',
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

  async createSummarizeAgent() {
    try {
      // Create PDF generator tool
      const pdfGeneratorTool = tool(
        async (input) => {
          try {
            const { content } = input;
            const timestamp = new Date().getTime();
            const filename = `audit_summary_report_${timestamp}.pdf`;
            const outputPath = path.join(this.pdfOutputPath, filename);

            // Convert markdown to HTML
            const html = marked.parse(content);

            // Generate PDF using puppeteer
            const browser = await puppeteer.launch({
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

            this.loggerService.log(
              JSON.stringify({
                message: 'PDF generated successfully',
                service: 'SupervisorService',
                method: 'pdfGeneratorTool',
                filename,
                outputPath,
              }),
            );

            const fileUrl = await this.getFileUrl(filename);
            return `PDF generated successfully, file URL: ${fileUrl}`;
          } catch (error) {
            this.loggerService.error(
              JSON.stringify({
                message: 'Error generating PDF',
                service: 'SupervisorService',
                method: 'pdfGeneratorTool',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              }),
            );
            throw new Error(
              `Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
        {
          name: 'pdf_generator',
          description: 'Generate a PDF document from markdown content',
          schema: z.object({
            content: z
              .string()
              .describe('The markdown content to convert to PDF'),
            title: z.string().describe('The title of the PDF document'),
          }),
        },
      );

      // Use the prompt from the imported file
      //   const promptMessage = new SystemMessage(supervisorSummaryAgentPrompt);

      this.summarizeAgent = createReactAgent({
        llm: this.llm,
        tools: [pdfGeneratorTool],
        prompt: `
Always provide the markdown content to the pdf_generator tool.
Always use the pdf_generator tool to generate a PDF document from the markdown content.
        `,
      });
      this.members = ['summarizer'];

      this.loggerService.log(
        JSON.stringify({
          message: 'Summarize agent created successfully',
          service: 'SupervisorService',
          method: 'createSummarizeAgent',
        }),
      );

      return this.summarizeAgent;
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error creating summarize agent',
          service: 'SupervisorService',
          method: 'createSummarizeAgent',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  async createSupervisor() {
    try {
      if (!this.summarizeAgent) {
        throw new Error('Summarize agent not initialized');
      }

      this.loggerService.log(
        JSON.stringify({
          message: 'Starting supervisor creation',
          service: 'SupervisorService',
          method: 'createSupervisor',
        }),
      );

      const systemPrompt =
        'You are a supervisor tasked with managing a conversation between the' +
        ' following workers: {members}. Given the following user request,' +
        ' respond with the worker to act next. Each worker will perform a' +
        ' task and respond with their results and status. When finished,' +
        ' respond with FINISH.';

      const options = [END, ...this.members];

      const checkpointer = new MemorySaver();

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
        options: options.join(', '),
        members: this.members.join(', '),
      });

      const supervisorChain = formattedPrompt
        .pipe(
          this.llm.bindTools([routingTool], {
            tool_choice: 'route',
          }),
        )
        // select the first one
        .pipe((x) => x.tool_calls[0].args);

      if (!this.AgentState) {
        throw new Error('AgentState not initialized');
      }

      this.loggerService.log(
        JSON.stringify({
          message: 'Creating workflow graph',
          service: 'SupervisorService',
          method: 'createSupervisor',
          members: this.members,
        }),
      );

      const workflow = new StateGraph(this.AgentState)
        // 2. Add the nodes; these will do the work
        .addNode('summarizer', this.summarizeAgent)
        .addNode('supervisor', supervisorChain);
      // 3. Define the edges. We will define both regular and conditional ones
      // After a worker completes, report to supervisor
      this.members.forEach((member) => {
        workflow.addEdge(member as any, 'supervisor');
      });

      workflow.addConditionalEdges(
        'supervisor',
        (x: typeof this.AgentState.State) => x.next,
      );

      workflow.addEdge(START, 'supervisor');

      this.loggerService.log(
        JSON.stringify({
          message: 'Compiling workflow graph',
          service: 'SupervisorService',
          method: 'createSupervisor',
        }),
      );

      const graph = workflow.compile({
        checkpointer,
      });
      this.supervisor = graph;

      this.loggerService.log(
        JSON.stringify({
          message: 'Supervisor created successfully',
          service: 'SupervisorService',
          method: 'createSupervisor',
        }),
      );

      return 'Compiled supervisor';
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error creating supervisor',
          service: 'SupervisorService',
          method: 'createSupervisor',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  async generateSummaryReport(content: string, threadId: string = 'default') {
    try {
      if (!this.summarizeAgent) {
        throw new Error('Summarize agent not initialized');
      }

      this.loggerService.log(
        JSON.stringify({
          message: 'Starting summary report generation',
          service: 'SupervisorService',
          method: 'generateSummaryReport',
          contentLength: content.length,
          threadId,
        }),
      );

      const result = await this.supervisor.invoke(
        {
          messages: [
            {
              role: 'user',
              content: content,
            },
          ],
        },
        {
          configurable: {
            thread_id: threadId,
          },
          recursionLimit: 30,
        },
      );

      this.loggerService.log(
        JSON.stringify({
          message: 'Summary report generated successfully',
          service: 'SupervisorService',
          method: 'generateSummaryReport',
          messageCount: result.messages.length,
          resultLength:
            result.messages[result.messages.length - 1].content.length,
        }),
      );

      return result.messages[result.messages.length - 1].content;
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error generating summary report',
          service: 'SupervisorService',
          method: 'generateSummaryReport',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          threadId,
        }),
      );
      throw new HttpException(
        `Failed to generate summary report: ${error instanceof Error ? error.message : String(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async run(task: string, threadId: string = 'default') {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Starting report generation',
          service: 'SupervisorService',
          method: 'run',
          task,
          threadId,
        }),
      );

      const auditData = await this.databaseService.getAIAuditProgressData();

      this.loggerService.log(
        JSON.stringify({
          message: 'Retrieved audit data',
          service: 'SupervisorService',
          method: 'run',
          dataCount: auditData.data.length,
          sampleCount: Math.min(20, auditData.data.length),
        }),
      );

      const content = supervisorSummaryAgentPrompt(
        JSON.stringify(auditData.data),
        task || 'Create a detailed summary report of the audit data',
        new Date().toISOString().split('T')[0],
      );

      this.loggerService.log(
        JSON.stringify({
          message: 'Prepared content for summary generation',
          service: 'SupervisorService',
          method: 'run',
          contentLength: content.length,
          task: task || 'Create a detailed summary report of the audit data',
        }),
      );

      const result = await this.generateSummaryReport(content, threadId);

      this.loggerService.log(
        JSON.stringify({
          message: 'Summary report generated successfully',
          service: 'SupervisorService',
          method: 'run',
          resultLength: result.length,
        }),
      );

      return result;
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Failed to generate summary report',
          service: 'SupervisorService',
          method: 'run',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          task,
          threadId,
        }),
      );

      throw new HttpException(
        `Failed to generate summary report: ${error instanceof Error ? error.message : String(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getFileUrl(filename: string): Promise<string> {
    try {
      // Check if file exists
      const filePath = path.join(this.pdfOutputPath, filename);
      await fs.access(filePath);

      this.loggerService.log(
        JSON.stringify({
          message: 'File found',
          service: 'SupervisorService',
          method: 'getFileUrl',
          filename,
          path: filePath,
        }),
      );

      return `${this.configService.get('APP_URL')}/files/${filename}`;
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'File not found',
          service: 'SupervisorService',
          method: 'getFileUrl',
          filename,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw new HttpException(
        `File not found: ${filename}`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async getAllReports() {
    try {
      const files = await fs.readdir(this.pdfOutputPath);

      this.loggerService.log(
        JSON.stringify({
          message: 'Retrieved all report files',
          service: 'SupervisorService',
          method: 'getAllReports',
          fileCount: files.length,
          files,
        }),
      );

      // Process files and get URLs
      const filePromises = files.map(async (file) => {
        try {
          const url = await this.getFileUrl(file);
          // Extract timestamp from filename and convert to number
          const timestampMatch = file.match(/\d+/);
          const timestamp = timestampMatch
            ? parseInt(timestampMatch[0], 10)
            : 0;

          return {
            filename: file,
            url,
            createdAt: new Date(timestamp).toISOString(),
          };
        } catch (error) {
          this.loggerService.error(
            JSON.stringify({
              message: 'Error getting URL for file',
              service: 'SupervisorService',
              method: 'getAllReports',
              filename: file,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
          return null;
        }
      });

      const results = await Promise.all(filePromises);
      const validResults = results.filter(Boolean);

      this.loggerService.log(
        JSON.stringify({
          message: 'Processed all report files',
          service: 'SupervisorService',
          method: 'getAllReports',
          totalFiles: files.length,
          validFiles: validResults.length,
        }),
      );

      return validResults;
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error reading reports directory',
          service: 'SupervisorService',
          method: 'getAllReports',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }
  }
}
