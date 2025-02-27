"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var DatabaseService_1;
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const sql = require("mssql");
let DatabaseService = DatabaseService_1 = class DatabaseService {
    constructor(db) {
        this.db = db;
        this.logger = new common_1.Logger(DatabaseService_1.name);
    }
    async getAIAuditProgressData() {
        try {
            const result = await this.db
                .request()
                .query('SELECT * FROM AIAuditProgress');
            this.logger.log('Successfully fetched AI Audit Progress data');
            return {
                success: true,
                data: result.recordset,
            };
        }
        catch (error) {
            this.logger.error('Error fetching data from AIAuditProgress:', error);
            throw new Error('Failed to fetch AI Audit Progress data');
        }
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = DatabaseService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)('MSSQL_CONNECTION')),
    __metadata("design:paramtypes", [typeof (_a = typeof sql !== "undefined" && sql.ConnectionPool) === "function" ? _a : Object])
], DatabaseService);
//# sourceMappingURL=db.service.js.map