"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentsModule = void 0;
const common_1 = require("@nestjs/common");
const agents_controller_1 = require("./controllers/agents.controller");
const agents_service_1 = require("./services/agents.service");
const rag_service_1 = require("./services/rag.service");
const supervisor_service_1 = require("./services/supervisor.service");
const db_module_1 = require("../../common/db/db.module");
const self_rag_service_1 = require("./services/self-rag.service");
const supervisor_v2_service_1 = require("./services/supervisor-v2.service");
const summary_service_1 = require("./services/summary.service");
let AgentsModule = class AgentsModule {
};
exports.AgentsModule = AgentsModule;
exports.AgentsModule = AgentsModule = __decorate([
    (0, common_1.Module)({
        imports: [db_module_1.DatabaseModule],
        controllers: [agents_controller_1.AgentsController],
        providers: [
            agents_service_1.AgentsService,
            rag_service_1.RagService,
            supervisor_service_1.SupervisorService,
            self_rag_service_1.SelfRagService,
            supervisor_v2_service_1.SupervisorV2Service,
            summary_service_1.SummaryService,
        ],
    })
], AgentsModule);
//# sourceMappingURL=agents.module.js.map