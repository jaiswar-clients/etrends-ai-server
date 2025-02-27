import { Injectable } from '@nestjs/common';
import { ConfigService as NestJsConfigService } from '@nestjs/config';
import ConfigDTO from '../dto';

@Injectable()
export class ConfigService extends NestJsConfigService<ConfigDTO> {
  constructor() {
    super({
      // Pass an empty object as the process.env default
      // NestJS ConfigModule will handle the actual environment variables
      cache: true,
    });
  }

  get IS_PRODUCTION(): boolean {
    return this.get('NODE_ENV', { infer: true }) === 'production';
  }
}
