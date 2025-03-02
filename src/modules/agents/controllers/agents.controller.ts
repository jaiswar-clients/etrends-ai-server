import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RagService } from '../services/rag.service';
import { SupervisorService } from '../services/supervisor.service';
import { SelfRagService } from '../services/self-rag.service';
import { SupervisorV2Service } from '../services/supervisor-v2.service';

@Controller('agents')
export class AgentsController {
  constructor(
    private readonly ragService: RagService,
    private readonly supervisorService: SupervisorService,
    private readonly selfRagService: SelfRagService,
    private readonly supervisorV2Service: SupervisorV2Service,
  ) {}

  @Get('reports')
  async getAllReports() {
    return this.supervisorService.getAllReports();
  }

  @Post('chat')
  async askAgent(@Body() body: { question: string; threadId?: string }) {
    return this.ragService.askAgent(body.question, body.threadId || 'default');
  }

  @Post('report')
  async runSupervisor(@Body() body: { question: string; threadId?: string }) {
    // return this.supervisorService.run(
    //   body.question,
    //   body.threadId || 'default',
    // );
    return this.supervisorV2Service.run(
      body.question,
      body.threadId || 'default',
    );
  }
}
