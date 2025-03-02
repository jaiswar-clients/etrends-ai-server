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
import Anthropic from '@anthropic-ai/sdk';

import { DatabaseService } from '@/common/db/db.service';
import { LoggerService } from '@/common/logger/services/logger.service';
import { supervisorSummaryAgentPrompt } from '@/prompts/index';

@Injectable()
export class SupervisorV2Service implements OnModuleInit {
  private anthropic: Anthropic;
  private readonly pdfOutputPath: string;
  private readonly chartOutputPath: string;
  private model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {
    this.pdfOutputPath = path.join(process.cwd(), 'files');
    this.chartOutputPath = path.join(process.cwd(), 'files');
    this.model =
      this.configService.get('AI_MODEL') || 'claude-3-sonnet-20240229';
  }

  async onModuleInit() {
    try {
      await this.initialize();
      this.loggerService.log(
        JSON.stringify({
          message: 'SupervisorV2Service initialized successfully',
          service: 'SupervisorV2Service',
          method: 'onModuleInit',
        }),
      );
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error initializing SupervisorV2Service',
          service: 'SupervisorV2Service',
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
          service: 'SupervisorV2Service',
          method: 'initialize',
          paths: {
            pdfOutputPath: this.pdfOutputPath,
            chartOutputPath: this.chartOutputPath,
          },
        }),
      );

      // Initialize Anthropic client
      this.anthropic = new Anthropic({
        apiKey: this.configService.get('ANTHROPIC_API_KEY'),
      });

      this.loggerService.log(
        JSON.stringify({
          message: 'Anthropic client initialized',
          service: 'SupervisorV2Service',
          method: 'initialize',
          model: this.model,
        }),
      );
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error in initialization',
          service: 'SupervisorV2Service',
          method: 'initialize',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  async setModel(model: string) {
    this.model = model;
    this.loggerService.log(
      JSON.stringify({
        message: 'Model updated',
        service: 'SupervisorV2Service',
        method: 'setModel',
        model: this.model,
      }),
    );
  }

  async generateSummaryReport(content: string, threadId: string = 'default') {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Starting summary report generation',
          service: 'SupervisorV2Service',
          method: 'generateSummaryReport',
          contentLength: content.length,
          threadId,
        }),
      );

      // First, ask the model to analyze the data and create a summary
      const analysisPrompt = `
You are a data analysis expert. Analyze the following data and create a comprehensive summary:

${content}

Your analysis should include:
1. Key findings and insights
2. Important patterns or trends
3. Recommendations based on the data
4. Any anomalies or areas of concern

Format your response as detailed markdown that can be converted to a professional PDF report.

Don't include any text with ## except this use any other heading as needed.

Example:
NOT USE THIS
## Locations Identified in the Report: 1. Mumbai (MUM) - 13 audits 2. Pune - 7 audits

USE THIS
### Locations Identified in the Report: 1. Mumbai (MUM) - 13 audits 2. Pune - 7 audits

`;

      const analysisResponse = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 16000,
        temperature: 0,
        system:
          'You are a helpful AI assistant that specializes in data analysis and report generation.',
        messages: [{ role: 'user', content: analysisPrompt }],
      });

      // Extract the text content properly handling different content block types
      let markdownContent = '';
      if (analysisResponse.content && analysisResponse.content.length > 0) {
        const contentBlock = analysisResponse.content[0];

        // Check the type of content block and extract text accordingly
        if (contentBlock.type === 'text') {
          markdownContent = contentBlock.text;
        } else if (contentBlock.type === 'tool_use') {
          // Handle tool use blocks if needed
          this.loggerService.log(
            JSON.stringify({
              message: 'Received tool_use block instead of text',
              service: 'SupervisorV2Service',
              method: 'generateSummaryReport',
              toolUse: contentBlock.name,
            }),
          );
          markdownContent = `Tool Use Response: ${contentBlock.name}`;
        } else {
          // Handle any other content block types
          this.loggerService.log(
            JSON.stringify({
              message: 'Received unexpected content block type',
              service: 'SupervisorV2Service',
              method: 'generateSummaryReport',
              blockType: contentBlock.type,
            }),
          );
          markdownContent =
            'Unexpected response format received from AI model.';
        }
      } else {
        this.loggerService.error(
          JSON.stringify({
            message: 'No content received from AI model',
            service: 'SupervisorV2Service',
            method: 'generateSummaryReport',
          }),
        );
        throw new Error('No content received from AI model');
      }

      // Generate PDF from the markdown content
      const pdfResult = await this.generatePDF(markdownContent);

      this.loggerService.log(
        JSON.stringify({
          message: 'Summary report generated successfully',
          service: 'SupervisorV2Service',
          method: 'generateSummaryReport',
          resultLength: markdownContent.length,
        }),
      );

      return {
        content: markdownContent,
        pdf: pdfResult,
      };
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error generating summary report',
          service: 'SupervisorV2Service',
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

  async generatePDF(content: string): Promise<string> {
    try {
      const timestamp = new Date().getTime();
      const filename = `audit_summary_report_${timestamp}.pdf`;
      const outputPath = path.join(this.pdfOutputPath, filename);

      // Convert markdown to HTML - without the removed options
      marked.setOptions({
        gfm: true,
      });
      
      // Convert markdown to HTML and ensure it's a string
      const html = await Promise.resolve(marked.parse(content));
      
      this.loggerService.log(
        JSON.stringify({
          message: 'Markdown converted to HTML',
          service: 'SupervisorV2Service',
          method: 'generatePDF',
          contentLength: content.length,
          htmlLength: html.length,
        }),
      );

      // Generate PDF using puppeteer
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();

      // Read logo file and convert to base64
      const logoPath = path.join(process.cwd(), 'public', 'images', 'logo.jpg');
      const logoBuffer = await fs.readFile(logoPath);
      const logoBase64 = `data:image/jpeg;base64,${logoBuffer.toString('base64')}`;
      
      this.loggerService.log(
        JSON.stringify({
          message: 'Logo image encoded to base64',
          service: 'SupervisorV2Service',
          method: 'generatePDF',
          logoPath,
        }),
      );

      await page.setContent(`
        <html>
          <title>Audit Report(${new Date().toISOString().split('T')[0]})</title>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 40px;
                margin-top: 15px; /* Increased top margin to accommodate the logo */
                line-height: 1.6;
              }
              h1 {
                color: #333;
                border-bottom: 1px solid #ddd;
                padding-bottom: 10px;
                margin-top: 30px; /* Ensure first heading doesn't overlap with logo */
              }
              h2 {
                color: #444;
                margin-top: 20px;
                font-size: 1.5em;
              }
              h3 {
                color: #555;
                margin-top: 16px;
                font-size: 1.2em;
              }
              p {
                margin-bottom: 16px;
              }
              ul, ol {
                margin-bottom: 16px;
                padding-left: 20px;
              }
              li {
                margin-bottom: 8px;
              }
              /* Ensure proper spacing at the top of the document */
              .content {
                padding-top: 20px;
              }
              /* Add styling for code blocks */
              pre {
                background-color: #f5f5f5;
                padding: 10px;
                border-radius: 5px;
                overflow-x: auto;
              }
              code {
                font-family: monospace;
              }
              /* Table styling */
              table {
                border-collapse: collapse;
                width: 100%;
                margin-bottom: 16px;
              }
              th, td {
                border: 1px solid #ddd;
                padding: 8px;
                text-align: left;
              }
              th {
                background-color: #f2f2f2;
              }
            </style>
          </head>
          <body>
            <div class="content">
              ${html}
            </div>
          </body>
        </html>
      `);


      await page.pdf({
        path: outputPath,
        format: 'A4',
        margin: {
          top: '80px', /* Increased top margin to accommodate the logo */
          right: '20px',
          bottom: '20px',
          left: '20px',
        },
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="width: 100%; height: 60px; padding: 0; position: relative; border-bottom: 1px solid #eee;">
            <img src="${logoBase64}" style="height: 40px; position: absolute; top: 10px; left: 20px;" />
          </div>
        `,
        footerTemplate: `
          <div style="width: 100%; font-size: 9px; text-align: center; color: #777;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `,
      });
      
      await browser.close();

      this.loggerService.log(
        JSON.stringify({
          message: 'PDF generated successfully with logo',
          service: 'SupervisorV2Service',
          method: 'generatePDF',
          filename,
          outputPath,
        }),
      );

      const fileUrl = await this.getFileUrl(filename);
      return fileUrl;
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error generating PDF with logo',
          service: 'SupervisorV2Service',
          method: 'generatePDF',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw new Error(
        `Failed to generate PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async run(task: string, threadId: string = 'default') {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Starting report generation',
          service: 'SupervisorV2Service',
          method: 'run',
          task,
          threadId,
        }),
      );

      const auditData = await this.databaseService.getAIAuditProgressData();

      this.loggerService.log(
        JSON.stringify({
          message: 'Retrieved audit data',
          service: 'SupervisorV2Service',
          method: 'run',
          dataCount: auditData.length,
          sampleCount: Math.min(20, auditData.length),
        }),
      );

      const content = supervisorSummaryAgentPrompt(
        JSON.stringify(auditData.slice(0,20)),
        task || 'Create a detailed summary report of the audit data',
        new Date().toISOString().split('T')[0],
      );

      this.loggerService.log(
        JSON.stringify({
          message: 'Prepared content for summary generation',
          service: 'SupervisorV2Service',
          method: 'run',
          contentLength: content.length,
          task: task || 'Create a detailed summary report of the audit data',
        }),
      );

      const result = await this.generateSummaryReport(content, threadId);

      this.loggerService.log(
        JSON.stringify({
          message: 'Summary report generated successfully',
          service: 'SupervisorV2Service',
          method: 'run',
          resultLength: result.content.length,
        }),
      );

      return result;
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Failed to generate summary report',
          service: 'SupervisorV2Service',
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
          service: 'SupervisorV2Service',
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
          service: 'SupervisorV2Service',
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
          service: 'SupervisorV2Service',
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
              service: 'SupervisorV2Service',
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
          service: 'SupervisorV2Service',
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
          service: 'SupervisorV2Service',
          method: 'getAllReports',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }
  }
}
