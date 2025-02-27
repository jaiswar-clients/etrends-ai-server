import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RagService } from '../services/rag.service';
import { SupervisorService } from '../services/supervisor.service';

@Controller('agents')
export class AgentsController {
  constructor(
    private readonly ragService: RagService,
    private readonly supervisorService: SupervisorService,
  ) {}

  @Post('chat')
  async askAgent(@Body() body: { question: string; threadId?: string }) {
    return this.ragService.askAgent(body.question, body.threadId || 'default');
  }

  @Post('supervisor')
  async runSupervisor(@Body() body: { message: string; threadId?: string }) {
    return this.supervisorService.run(body.message, body.threadId || 'default');
  }

  @Post('audit-report')
  async getAuditReport(@Body() body: { query: string; threadId?: string }) {
    return this.supervisorService.getAuditReport(body.query, body.threadId || 'default');
  }

  @Get('files/:filename')
  getFile(@Param('filename') filename: string) {
    return { url: `/files/${filename}` };
  }
}
