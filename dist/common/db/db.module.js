"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const db_service_1 = require("./db.service");
const sql = require("mssql");
const config_service_1 = require("../config/services/config.service");
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        providers: [
            db_service_1.DatabaseService,
            {
                provide: 'MSSQL_CONNECTION',
                inject: [config_service_1.ConfigService],
                useFactory: async (configService) => {
                    const config = {
                        user: configService.get('DATABASE_USER'),
                        password: configService.get('DATABASE_PASSWORD'),
                        server: configService.get('DATABASE_URL'),
                        port: parseInt(configService.get('DATABASE_PORT')),
                        database: configService.get('DATABASE_NAME'),
                        options: {
                            encrypt: false,
                            trustServerCertificate: false,
                        },
                        pool: {
                            max: 10,
                            min: 0,
                            idleTimeoutMillis: 30000
                        },
                        requestTimeout: 30000
                    };
                    try {
                        const pool = await sql.connect(config);
                        console.log('Connected to SQL Server');
                        return pool;
                    }
                    catch (error) {
                        console.error('Database connection failed:', error);
                        throw error;
                    }
                },
            },
        ],
        exports: [db_service_1.DatabaseService, 'MSSQL_CONNECTION'],
    })
], DatabaseModule);
//# sourceMappingURL=db.module.js.map