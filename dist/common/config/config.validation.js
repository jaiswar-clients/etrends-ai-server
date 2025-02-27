"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validationSchema = void 0;
const Joi = require("joi");
exports.validationSchema = Joi.object({
    PORT: Joi.string(),
    NODE_ENV: Joi.string().valid('local', 'development', 'production', 'test'),
    DATABASE_URL: Joi.string().required(),
    DATABASE_PORT: Joi.string().required(),
    DATABASE_USER: Joi.string().required(),
    DATABASE_PASSWORD: Joi.string().required(),
    DATABASE_NAME: Joi.string().required(),
    CLIENT_URL: Joi.string().required(),
    APP_URL: Joi.string().required(),
    ANTHROPIC_API_KEY: Joi.string().required(),
    OPENAI_API_KEY: Joi.string().required(),
});
//# sourceMappingURL=config.validation.js.map