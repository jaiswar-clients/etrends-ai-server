import { DynamicModule, ForwardReference, Module, Type } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerModule } from '@/common/logger/logger.module';
import { HttpModule } from '@/common/http/http.module';
import { ConfigModule } from '@/common/config/config.module';
import { DatabaseModule } from '@/common/db/db.module';
import { AgentsModule } from './agents/agents.module';

type NestModuleImport =
  | Type<any>
  | DynamicModule
  | Promise<DynamicModule>
  | ForwardReference<any>;

const appModules: NestModuleImport[] = [
  LoggerModule, 
  HttpModule, 
  ConfigModule,
  DatabaseModule
];

@Module({
  imports: [...appModules, AgentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
