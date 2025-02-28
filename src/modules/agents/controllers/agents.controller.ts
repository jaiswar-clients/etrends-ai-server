import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RagService } from '../services/rag.service';
import { SupervisorService } from '../services/supervisor.service';

@Controller('agents')
export class AgentsController {
  constructor(
    private readonly ragService: RagService,
    private readonly supervisorService: SupervisorService,
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
    return this.supervisorService.run(body.question, body.threadId || 'default');
  }
}
