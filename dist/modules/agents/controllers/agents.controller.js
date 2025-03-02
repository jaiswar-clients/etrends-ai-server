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
exports.AgentsController = void 0;
const common_1 = require("@nestjs/common");
const rag_service_1 = require("../services/rag.service");
const supervisor_service_1 = require("../services/supervisor.service");
const self_rag_service_1 = require("../services/self-rag.service");
const supervisor_v2_service_1 = require("../services/supervisor-v2.service");
let AgentsController = class AgentsController {
    constructor(ragService, supervisorService, selfRagService, supervisorV2Service) {
        this.ragService = ragService;
        this.supervisorService = supervisorService;
        this.selfRagService = selfRagService;
        this.supervisorV2Service = supervisorV2Service;
    }
    async getAllReports() {
        return this.supervisorService.getAllReports();
    }
    async askAgent(body) {
        return this.ragService.askAgent(body.question, body.threadId || 'default');
    }
    async runSupervisor(body) {
        return this.supervisorV2Service.run(body.question, body.threadId || 'default');
    }
};
exports.AgentsController = AgentsController;
__decorate([
    (0, common_1.Get)('reports'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "getAllReports", null);
__decorate([
    (0, common_1.Post)('chat'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "askAgent", null);
__decorate([
    (0, common_1.Post)('report'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentsController.prototype, "runSupervisor", null);
exports.AgentsController = AgentsController = __decorate([
    (0, common_1.Controller)('agents'),
    __metadata("design:paramtypes", [rag_service_1.RagService,
        supervisor_service_1.SupervisorService,
        self_rag_service_1.SelfRagService,
        supervisor_v2_service_1.SupervisorV2Service])
], AgentsController);
//# sourceMappingURL=agents.controller.js.map