import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as sql from 'mssql';
import { LoggerService } from '../logger/services/logger.service';
import { ConfigService } from '../config/services/config.service';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import Anthropic from '@anthropic-ai/sdk';

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
  auditFrom: string; // ISO date string
  Auditto: string; // ISO date string
  Days: number;
  Status: string;
  PerComp: number;
  'Overdue Days': number;
  Trouble: number;
  NeedsAttention: number;
  OnPlan: number;
  Completed: number;
}

@Injectable()
export class DatabaseService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseService.name);
  private llm: ChatAnthropic;

  constructor(
    @Inject('MSSQL_CONNECTION') private readonly db: sql.ConnectionPool,
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.llm = new ChatAnthropic({
      apiKey: this.configService.get('ANTHROPIC_API_KEY'),
      model: this.configService.get('AI_MODEL'),
      createClient: (options) => {
        return new Anthropic({
          apiKey: this.configService.get('ANTHROPIC_API_KEY'),
        });
      },
    });
  }

  async onModuleInit() {
    // const result = await this.observationDataForVectorStore();
    // console.log(result);
  }

  async getAIAuditProgressData(): Promise<IAuditData[]> {
    try {
      const result = await this.db
        .request()
        .query('SELECT * FROM AIAuditProgress');

      this.logger.log('Successfully fetched AI Audit Progress data');
      return result.recordset;
    } catch (error) {
      this.logger.error('Error fetching data from AIAuditProgress:', error);
      throw new Error('Failed to fetch AI Audit Progress data');
    }
  }

  async auditDataForVectorStore() {
    try {
      const result = await this.getAIAuditProgressData();
      const totalAudits = result.length;

      // Basic Status Metrics
      const statusDistribution = this.createAuditDistribution(result, 'Status');
      const completedAudits = result.filter((a) =>
        a.Status.includes('Completed'),
      ).length;
      const inProgressAudits = result.filter((a) =>
        a.Status.includes('In progress'),
      ).length;

      // Overdue Analysis
      const totalOverdueDays = result.reduce(
        (sum, a) => sum + (a['Overdue Days'] || 0),
        0,
      );
      const avgOverdueDays =
        totalAudits > 0 ? totalOverdueDays / totalAudits : 0;
      const overdueAudits = result.filter(
        (a) => (a['Overdue Days'] || 0) > 0,
      ).length;

      // Critical Concerns
      const totalTrouble = result.reduce((sum, a) => sum + a.Trouble, 0);
      const totalAttentionNeeded = result.reduce(
        (sum, a) => sum + a.NeedsAttention,
        0,
      );

      // Temporal Analysis
      const currentYear = new Date().getFullYear();
      const currentYearAudits = result.filter(
        (a) => new Date(a.auditFrom).getFullYear() === currentYear,
      ).length;

      // Organizational Distribution
      const sbuDistribution = this.createAuditDistribution(result, 'SBU');
      const locationDistribution = this.createAuditDistribution(
        result,
        'Location',
      );
      const areaDistribution = this.createAuditDistribution(result, 'AreaName');

      // Auditor Workload
      const reviewerWorkload = this.createAuditDistribution(result, 'Reviewer');
      const leadAuditorWorkload = this.createAuditDistribution(
        result,
        'LeadAuditor',
      );

      // Completion Analysis
      const avgCompletion =
        totalAudits > 0
          ? result.reduce((sum, a) => sum + a.PerComp, 0) / totalAudits
          : 0;

      // Build textual representation
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

      // Append individual audit details
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

      const response = await this.llm.invoke([
        new SystemMessage(
          'You are a helpful assistant that summarizes audit data. and create unique and help full insights from the data. This data will be used for RAG and will be stored in a vector database.',
        ),
        new HumanMessage(`
            This is the manual preprocessed data:
            ${textualData}

            Actual Strigified Data:
            ${JSON.stringify(result)}
            `),
      ]);

      //   console.log(response.content);

      return response.content;
    } catch (error) {
      console.error('Error generating audit vector data:', error);
      return '';
    }
  }

  // Reuse the same helper functions from previous implementation
  private createAuditDistribution(
    data: IAuditData[],
    field: keyof IAuditData,
  ): Record<string, number> {
    return data.reduce((acc, item) => {
      const key = item[field]?.toString() || 'Unspecified';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  private formatAuditDistribution(
    label: string,
    distribution: Record<string, number>,
  ): string {
    let text = `${label}: `;
    const entries = Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    entries.forEach(([key, count]) => {
      text += `${key} (${count}), `;
    });

    return text.replace(/, $/, '. ');
  }

  async getObservationData(): Promise<IObservation[]> {
    try {
      const result = await this.db
        .request()
        .query('SELECT * FROM AIObservRequest');
      return result.recordset;
    } catch (error) {
      this.logger.error('Error fetching data from ObservationData:', error);
      throw new Error('Failed to fetch Observation Data');
    }
  }

  async observationDataForVectorStore() {
    try {
      const result = await this.getObservationData();
      const totalObservations = result.length;

      // Basic Status Metrics
      const totalClosedStatus = result.filter(
        (o) => o.Status === 'Close',
      ).length;
      const totalOpenStatus = result.filter((o) => o.Status === 'Open').length;
      const statusRatio =
        totalObservations > 0
          ? ((totalClosedStatus / totalObservations) * 100).toFixed(1)
          : 0;

      // Repeat Observations
      const totalRepeatObservations = result.filter(
        (o) => o['Repeat Observation'] === 'Yes',
      ).length;

      // Temporal Metrics
      const avgAge =
        totalObservations > 0
          ? result.reduce((sum, o) => sum + o.Age, 0) / totalObservations
          : 0;
      const currentYear = new Date().getFullYear();
      const currentYearObservations = result.filter((o) =>
        o['Financial Year']?.includes(currentYear.toString()),
      ).length;

      // Risk and Impact Metrics
      const riskCounts = this.createDistribution(result, 'Risk');
      const financialImpactCount = result.filter(
        (o) => parseFloat(o['Financial Implications']) > 0,
      ).length;

      // Breached Observations
      const breachedObservations = result.filter(
        (o) =>
          o.Status === 'Open' &&
          new Date(o['Target Completion Date']) < new Date(),
      ).length;

      // Not Due Observations
      const notDueObservations = result.filter(
        (o) =>
          o.Status === 'Close' ||
          new Date(o['Target Completion Date']) >= new Date(),
      ).length;

      // Location-wise Breached Observations
      const locationBreachedCounts = this.createDistribution(
        result.filter(
          (o) =>
            o.Status === 'Open' &&
            new Date(o['Target Completion Date']) < new Date(),
        ),
        'Location',
      );

      // Risk-wise Breached Observations
      const riskBreachedCounts = this.createDistribution(
        result.filter(
          (o) =>
            o.Status === 'Open' &&
            new Date(o['Target Completion Date']) < new Date(),
        ),
        'Risk',
      );

      // Organizational Distribution
      const auditAreaCounts = this.createDistribution(result, 'Audit Area');
      const sbuCounts = this.createDistribution(result, 'SBU');
      const regionCounts = this.createDistribution(result, 'Region');
      const departmentCounts = this.createDistribution(result, 'Department');

      // Observation Characteristics
      const typeCounts = this.createDistribution(result, 'Observation Type');
      const categoryCounts = this.createDistribution(result, 'Category');
      const actionPlanStatus = this.createDistribution(
        result,
        'Action Plan Status',
      );

      // Build textual representation
      let textualData = `Audit Observations Overview: \n`;
      textualData += `Total observations: ${totalObservations} (${statusRatio}% closed). \n`;
      textualData += `Open observations: ${totalOpenStatus}. \n`;
      textualData += `Repeat observations: ${totalRepeatObservations}. \n`;
      textualData += `Breached observations: ${breachedObservations}. \n`;
      textualData += `Not due observations: ${notDueObservations}. \n`;
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

      // Append individual observation details
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
        textualData += `--- \n `; // Separator for readability
      });

      const response = await this.llm.invoke([
        new SystemMessage(
          'You are a helpful assistant that summarizes audit data. and create unique and help full insights from the data. This data will be used for RAG and will be stored in a vector database.',
        ),
        new HumanMessage(`
            This is the manual preprocessed data:
            ${textualData}

            Actual Strigified Data:
            ${JSON.stringify(result)}
            `),
      ]);

      return response.content;
    } catch (error) {
      console.error('Error generating vector store data:', error);
      return ''; // Return empty string to prevent vectorization failures
    }
  }

  // Helper function to create distribution counts
  private createDistribution(
    data: IObservation[],
    field: keyof IObservation,
  ): Record<string, number> {
    return data.reduce((acc, item) => {
      const key = item[field] || 'Unspecified';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  // Helper function to format distributions into text
  private formatDistribution(
    label: string,
    distribution: Record<string, number>,
  ): string {
    let text = `${label}: `;
    const entries = Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // Keep top 5 to avoid bloating

    entries.forEach(([key, count]) => {
      text += `${key} (${count}), `;
    });

    return text.replace(/, $/, '. ');
  }
}
