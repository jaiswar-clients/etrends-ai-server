import { Module } from '@nestjs/common';
import { AgentsController } from './controllers/agents.controller';
import { AgentsService } from './services/agents.service';
import { RagService } from './services/rag.service';
import { SupervisorService } from './services/supervisor.service';
import { DatabaseModule } from '@/common/db/db.module';

@Module({
  imports: [DatabaseModule],
  controllers: [AgentsController],
  providers: [AgentsService, RagService, SupervisorService],
})
export class AgentsModule {}
