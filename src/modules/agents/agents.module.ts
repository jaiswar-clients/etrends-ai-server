import { Module } from '@nestjs/common';
import { AgentsController } from './controllers/agents.controller';
import { AgentsService } from './services/agents.service';
import { RagService } from './services/rag.service';
import { SupervisorService } from './services/supervisor.service';
import { DatabaseModule } from '@/common/db/db.module';
import { SelfRagService } from './services/self-rag.service';
import { SupervisorV2Service } from './services/supervisor-v2.service';
import { SummaryService } from './services/summary.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    RagService,
    SupervisorService,
    SelfRagService,
    SupervisorV2Service,
    SummaryService,
  ],
})
export class AgentsModule {}
