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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppController = void 0;
const common_1 = require("@nestjs/common");
const app_service_1 = require("./app.service");
const db_service_1 = require("../common/db/db.service");
let AppController = class AppController {
    constructor(appService, databaseService) {
        this.appService = appService;
        this.databaseService = databaseService;
    }
    async getAIAuditProgressData() {
        return await this.databaseService.getAIAuditProgressData();
    }
    async getObservations() {
        return await this.databaseService.getObservationData();
    }
    async getLocationWiseAudits(startYear, endYear) {
        const yearFilter = {};
        if (startYear)
            yearFilter.startYear = startYear;
        if (endYear)
            yearFilter.endYear = endYear;
        return await this.databaseService.getLocationWiseAuditData(Object.keys(yearFilter).length ? yearFilter : undefined);
    }
    async getSBUWiseAudits(startYear, endYear) {
        const yearFilter = {};
        if (startYear)
            yearFilter.startYear = parseInt(startYear.toString(), 10);
        if (endYear)
            yearFilter.endYear = parseInt(endYear.toString(), 10);
        return await this.databaseService.getSBUWiseAuditData(Object.keys(yearFilter).length ? yearFilter : undefined);
    }
    async getYearWiseAudits() {
        return await this.databaseService.getYearWiseSBUData();
    }
};
exports.AppController = AppController;
__decorate([
    (0, common_1.Get)('ai-audit-progress'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getAIAuditProgressData", null);
__decorate([
    (0, common_1.Get)('observations'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getObservations", null);
__decorate([
    (0, common_1.Get)('location-wise-audits'),
    __param(0, (0, common_1.Query)('startYear')),
    __param(1, (0, common_1.Query)('endYear')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getLocationWiseAudits", null);
__decorate([
    (0, common_1.Get)('sbu-wise-audits'),
    __param(0, (0, common_1.Query)('startYear')),
    __param(1, (0, common_1.Query)('endYear')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number]),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getSBUWiseAudits", null);
__decorate([
    (0, common_1.Get)('year-wise-audits'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AppController.prototype, "getYearWiseAudits", null);
exports.AppController = AppController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [app_service_1.AppService,
        db_service_1.DatabaseService])
], AppController);
//# sourceMappingURL=app.controller.js.map