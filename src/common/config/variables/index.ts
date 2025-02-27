import { registerAs } from '@nestjs/config';

export const app = registerAs('APP', () => ({
  DATABASE_URL: process.env['DATABASE_URL'],
  DATABASE_PORT: process.env['DATABASE_PORT'],
  DATABASE_USER: process.env['DATABASE_USER'],
  DATABASE_PASSWORD: process.env['DATABASE_PASSWORD'],
  DATABASE_NAME: process.env['DATABASE_NAME'],
  PORT: process.env['PORT'],
  JWT_SECRET: process.env['JWT_SECRET'],
  CLIENT_URL: process.env['CLIENT_URL'],
  APP_URL: process.env['APP_URL'],
  ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'],
  OPENAI_API_KEY: process.env['OPENAI_API_KEY'],
}));
