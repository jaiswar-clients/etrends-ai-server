import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@/common/config/services/config.service';
import Anthropic from '@anthropic-ai/sdk';

import { DatabaseService } from '@/common/db/db.service';
import { LoggerService } from '@/common/logger/services/logger.service';
import { sbuWiseComparisonPrompt, auditWiseComparisonPrompt } from '@/prompts/index';

@Injectable()
export class SummaryService implements OnModuleInit {
  private anthropic: Anthropic;
  private model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {
    this.model = this.configService.get('AI_MODEL') || 'claude-3-sonnet-20240229';
  }

  async onModuleInit() {
    try {
      await this.initialize();
      this.loggerService.log(
        JSON.stringify({
          message: 'SummaryService initialized successfully',
          service: 'SummaryService',
          method: 'onModuleInit',
        }),
      );
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error initializing SummaryService',
          service: 'SummaryService',
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
      // Initialize Anthropic client
      this.anthropic = new Anthropic({
        apiKey: this.configService.get('ANTHROPIC_API_KEY'),
      });

      this.loggerService.log(
        JSON.stringify({
          message: 'Anthropic client initialized',
          service: 'SummaryService',
          method: 'initialize',
          model: this.model,
        }),
      );
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error in initialization',
          service: 'SummaryService',
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
        service: 'SummaryService',
        method: 'setModel',
        model: this.model,
      }),
    );
  }

  async generateSBUWiseSummary() {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Starting SBU-wise summary generation',
          service: 'SummaryService',
          method: 'generateSBUWiseSummary',
        }),
      );

      // Get SBU data from database
      const sbuData = await this.databaseService.getYearWiseSBUData();

      // Convert data to JSON string
      const jsonData = JSON.stringify(sbuData, null, 2);

      // Generate the prompt using existing function
      const prompt = sbuWiseComparisonPrompt(jsonData);

      // Call Anthropic API
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4000,
        temperature: 0,
        system: 'You are a helpful AI assistant that specializes in data analysis and audit report generation.',
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract the response text
      let summaryText = '';
      if (response.content && response.content.length > 0) {
        const contentBlock = response.content[0];
        if (contentBlock.type === 'text') {
          summaryText = contentBlock.text;
        }
      }

      this.loggerService.log(
        JSON.stringify({
          message: 'SBU-wise summary generated successfully',
          service: 'SummaryService',
          method: 'generateSBUWiseSummary',
          summaryLength: summaryText.length,
        }),
      );

      return summaryText;
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error generating SBU-wise summary',
          service: 'SummaryService',
          method: 'generateSBUWiseSummary',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  async generateLocationWiseSummary() {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Starting location-wise summary generation',
          service: 'SummaryService',
          method: 'generateLocationWiseSummary',
        }),
      );

      // Get location data from database
      const locationData = await this.databaseService.getYearWiseAuditData();

      // Convert data to JSON string
      const jsonData = JSON.stringify(locationData, null, 2);

      // Generate the prompt using existing function
      const prompt = auditWiseComparisonPrompt(jsonData);

      // Call Anthropic API
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4000,
        temperature: 0,
        system: 'You are a helpful AI assistant that specializes in data analysis and audit report generation.',
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract the response text
      let summaryText = '';
      if (response.content && response.content.length > 0) {
        const contentBlock = response.content[0];
        if (contentBlock.type === 'text') {
          summaryText = contentBlock.text;
        }
      }

      this.loggerService.log(
        JSON.stringify({
          message: 'Location-wise summary generated successfully',
          service: 'SummaryService',
          method: 'generateLocationWiseSummary',
          summaryLength: summaryText.length,
        }),
      );

      return summaryText;
    } catch (error: unknown) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error generating location-wise summary',
          service: 'SummaryService',
          method: 'generateLocationWiseSummary',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }
}
