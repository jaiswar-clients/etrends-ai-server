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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelfRagService = void 0;
const common_1 = require("@nestjs/common");
const langgraph_1 = require("@langchain/langgraph");
const langgraph_2 = require("@langchain/langgraph");
const messages_1 = require("@langchain/core/messages");
const retriever_1 = require("langchain/tools/retriever");
const prebuilt_1 = require("@langchain/langgraph/prebuilt");
const hnswlib_1 = require("@langchain/community/vectorstores/hnswlib");
const langgraph_3 = require("@langchain/langgraph");
const hub_1 = require("langchain/hub");
const zod_1 = require("zod");
const prompts_1 = require("@langchain/core/prompts");
const openai_1 = require("@langchain/openai");
const anthropic_1 = require("@langchain/anthropic");
const messages_2 = require("@langchain/core/messages");
const db_service_1 = require("../../../common/db/db.service");
const config_service_1 = require("../../../common/config/services/config.service");
const documents_1 = require("@langchain/core/documents");
const path = require("path");
const fs = require("fs/promises");
const logger_service_1 = require("../../../common/logger/services/logger.service");
const output_parsers_1 = require("@langchain/core/output_parsers");
const document_1 = require("langchain/util/document");
let SelfRagService = class SelfRagService {
    constructor(databaseService, configService, loggerService) {
        this.databaseService = databaseService;
        this.configService = configService;
        this.loggerService = loggerService;
        this.vectorStorePath = path.join(process.cwd(), 'vector_store');
    }
    async onModuleInit() {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Initializing Self-RAG service',
                service: 'SelfRagService',
                method: 'onModuleInit',
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error initializing Self-RAG service',
                service: 'SelfRagService',
                method: 'onModuleInit',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async initialize(createVectorStore = false) {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Starting Self-RAG service initialization',
                service: 'SelfRagService',
                method: 'initialize',
                createVectorStore,
            }));
            this.embeddings = new openai_1.OpenAIEmbeddings({
                apiKey: this.configService.get('OPENAI_API_KEY'),
            });
            this.GraphState = langgraph_2.Annotation.Root({
                documents: (0, langgraph_2.Annotation)({
                    reducer: (x, y) => y ?? x ?? [],
                }),
                question: (0, langgraph_2.Annotation)({
                    reducer: (x, y) => y ?? x ?? '',
                }),
                generation: (0, langgraph_2.Annotation)({
                    reducer: (x, y) => y ?? x,
                    default: () => '',
                }),
                generationVQuestionGrade: (0, langgraph_2.Annotation)({
                    reducer: (x, y) => y ?? x,
                }),
                generationVDocumentsGrade: (0, langgraph_2.Annotation)({
                    reducer: (x, y) => y ?? x,
                }),
            });
            this.llm = new anthropic_1.ChatAnthropic({
                apiKey: this.configService.get('ANTHROPIC_API_KEY'),
                modelName: 'claude-3-5-sonnet-20240620',
                temperature: 0,
            });
            this.loggerService.log(JSON.stringify({
                message: 'LLM and embeddings initialized',
                service: 'SelfRagService',
                method: 'initialize',
                model: 'claude-3-5-sonnet-20240620',
            }));
            if (createVectorStore) {
                await this.createVectorStore();
            }
            await this.loadVectorStore();
            this.loggerService.log(JSON.stringify({
                message: 'Vector store loaded',
                service: 'SelfRagService',
                method: 'initialize',
            }));
            this.retriever = await this.loadVectorStoreAsRetriever();
            this.tool = (0, retriever_1.createRetrieverTool)(this.retriever, {
                name: 'retrieve_audit_data',
                description: 'Search and return information about audit data.',
            });
            this.tools = [this.tool];
            this.toolNode = new prebuilt_1.ToolNode(this.tools);
            this.loggerService.log(JSON.stringify({
                message: 'Tools and retriever initialized',
                service: 'SelfRagService',
                method: 'initialize',
                tools: this.tools.map((t) => t.name),
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error in Self-RAG initialization',
                service: 'SelfRagService',
                method: 'initialize',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                createVectorStore,
            }));
            throw error;
        }
    }
    async loadVectorStore() {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Loading vector store',
                service: 'SelfRagService',
                method: 'loadVectorStore',
                path: this.vectorStorePath,
            }));
            this.vectorStore = await hnswlib_1.HNSWLib.load(this.vectorStorePath, this.embeddings);
            this.loggerService.log(JSON.stringify({
                message: 'Vector store loaded successfully',
                service: 'SelfRagService',
                method: 'loadVectorStore',
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error loading vector store',
                service: 'SelfRagService',
                method: 'loadVectorStore',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async createVectorStore() {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Creating vector store',
                service: 'SelfRagService',
                method: 'createVectorStore',
            }));
            await fs.mkdir(path.dirname(this.vectorStorePath), { recursive: true });
            const auditData = await this.databaseService.getAIAuditProgressData();
            this.loggerService.log(JSON.stringify({
                message: 'Retrieved audit data for vector store',
                service: 'SelfRagService',
                method: 'createVectorStore',
                dataCount: auditData.length,
            }));
            const documents = auditData.map((item) => {
                return new documents_1.Document({
                    pageContent: JSON.stringify(item),
                    metadata: { source: 'audit_data', loc: item },
                });
            });
            this.vectorStore = await hnswlib_1.HNSWLib.fromDocuments(documents, this.embeddings);
            await this.vectorStore.save(this.vectorStorePath);
            this.loggerService.log(JSON.stringify({
                message: 'Vector store created and saved successfully',
                service: 'SelfRagService',
                method: 'createVectorStore',
                documentCount: documents.length,
                path: this.vectorStorePath,
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error creating vector store',
                service: 'SelfRagService',
                method: 'createVectorStore',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async loadVectorStoreAsRetriever() {
        const vectorStore = await hnswlib_1.HNSWLib.load(this.vectorStorePath, this.embeddings);
        const retriever = vectorStore.asRetriever();
        return retriever;
    }
    async similaritySearch(query, k = 4) {
        if (!this.vectorStore) {
            throw new Error('Vector store not initialized');
        }
        return await this.vectorStore.similaritySearch(query, k);
    }
    async retrieve(state, config) {
        this.loggerService.log(JSON.stringify({
            message: '---RETRIEVE---',
            service: 'SelfRagService',
            method: 'retrieve',
        }));
        try {
            const documents = await this.retriever
                .withConfig({ runName: 'FetchRelevantDocuments' })
                .invoke(state.question, config);
            this.loggerService.log(JSON.stringify({
                message: 'Documents retrieved successfully',
                service: 'SelfRagService',
                method: 'retrieve',
                documentCount: documents.length,
            }));
            return {
                documents,
            };
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error retrieving documents',
                service: 'SelfRagService',
                method: 'retrieve',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                question: state.question,
            }));
            return {
                documents: [],
            };
        }
    }
    async generate(state) {
        this.loggerService.log(JSON.stringify({
            message: '---GENERATE---',
            service: 'SelfRagService',
            method: 'generate',
        }));
        const prompt = await (0, hub_1.pull)('rlm/rag-prompt');
        const ragChain = prompt.pipe(this.llm).pipe(new output_parsers_1.StringOutputParser());
        const generation = await ragChain.invoke({
            context: (0, document_1.formatDocumentsAsString)(state.documents),
            question: state.question,
        });
        return {
            generation,
        };
    }
    async gradeDocuments(state) {
        this.loggerService.log(JSON.stringify({
            message: '---CHECK RELEVANCE---',
            service: 'SelfRagService',
            method: 'gradeDocuments',
        }));
        const llmWithTool = this.llm.withStructuredOutput(zod_1.z
            .object({
            binaryScore: zod_1.z
                .enum(['yes', 'no'])
                .describe("Relevance score 'yes' or 'no'"),
        })
            .describe("Grade the relevance of the retrieved documents to the question. Either 'yes' or 'no'."), {
            name: 'grade',
        });
        const prompt = prompts_1.ChatPromptTemplate.fromTemplate(`You are a grader assessing relevance of a retrieved document to a user question.
  Here is the retrieved document:

  {context}

  Here is the user question: {question}

  If the document contains keyword(s) or semantic meaning related to the user question, grade it as relevant.
  Give a binary score 'yes' or 'no' score to indicate whether the document is relevant to the question.`);
        const chain = prompt.pipe(llmWithTool);
        const filteredDocs = [];
        for await (const doc of state.documents) {
            const grade = await chain.invoke({
                context: doc.pageContent,
                question: state.question,
            });
            if (grade.binaryScore === 'yes') {
                this.loggerService.log(JSON.stringify({
                    message: '---GRADE: DOCUMENT RELEVANT---',
                    service: 'SelfRagService',
                    method: 'gradeDocuments',
                }));
                filteredDocs.push(doc);
            }
            else {
                this.loggerService.log(JSON.stringify({
                    message: '---GRADE: DOCUMENT NOT RELEVANT---',
                    service: 'SelfRagService',
                    method: 'gradeDocuments',
                }));
            }
        }
        return {
            documents: filteredDocs,
        };
    }
    async transformQuery(state) {
        this.loggerService.log(JSON.stringify({
            message: '---TRANSFORM QUERY---',
            service: 'SelfRagService',
            method: 'transformQuery',
        }));
        const prompt = prompts_1.ChatPromptTemplate.fromTemplate(`You are generating a question that is well optimized for semantic search retrieval.
  Look at the input and try to reason about the underlying sematic intent / meaning.
  Here is the initial question:
  \n ------- \n
  {question} 
  \n ------- \n
  Formulate an improved question: `);
        const chain = prompt.pipe(this.llm).pipe(new output_parsers_1.StringOutputParser());
        const betterQuestion = await chain.invoke({ question: state.question });
        return {
            question: betterQuestion,
        };
    }
    async generateGenerationVDocumentsGrade(state) {
        this.loggerService.log(JSON.stringify({
            message: '---GENERATE GENERATION vs DOCUMENTS GRADE---',
            service: 'SelfRagService',
            method: 'generateGenerationVDocumentsGrade',
        }));
        const llmWithTool = this.llm.withStructuredOutput(zod_1.z
            .object({
            binaryScore: zod_1.z
                .enum(['yes', 'no'])
                .describe("Relevance score 'yes' or 'no'"),
        })
            .describe("Grade the relevance of the retrieved documents to the question. Either 'yes' or 'no'."), {
            name: 'grade',
        });
        const prompt = prompts_1.ChatPromptTemplate.fromTemplate(`You are a grader assessing whether an answer is grounded in / supported by a set of facts.
  Here are the facts:
  \n ------- \n
  {documents} 
  \n ------- \n
  Here is the answer: {generation}
  Give a binary score 'yes' or 'no' to indicate whether the answer is grounded in / supported by a set of facts.`);
        const chain = prompt.pipe(llmWithTool);
        const score = await chain.invoke({
            documents: (0, document_1.formatDocumentsAsString)(state.documents),
            generation: state.generation,
        });
        return {
            generationVDocumentsGrade: score.binaryScore,
        };
    }
    async generateGenerationVQuestionGrade(state) {
        this.loggerService.log(JSON.stringify({
            message: '---GENERATE GENERATION vs QUESTION GRADE---',
            service: 'SelfRagService',
            method: 'generateGenerationVQuestionGrade',
        }));
        const llmWithTool = this.llm.withStructuredOutput(zod_1.z
            .object({
            binaryScore: zod_1.z
                .enum(['yes', 'no'])
                .describe("Relevance score 'yes' or 'no'"),
        })
            .describe("Grade the relevance of the retrieved documents to the question. Either 'yes' or 'no'."), {
            name: 'grade',
        });
        const prompt = prompts_1.ChatPromptTemplate.fromTemplate(`You are a grader assessing whether an answer is useful to resolve a question.
  Here is the answer:
  \n ------- \n
  {generation} 
  \n ------- \n
  Here is the question: {question}
  Give a binary score 'yes' or 'no' to indicate whether the answer is useful to resolve a question.`);
        const chain = prompt.pipe(llmWithTool);
        const score = await chain.invoke({
            question: state.question,
            generation: state.generation,
        });
        return {
            generationVQuestionGrade: score.binaryScore,
        };
    }
    decideToGenerate(state) {
        this.loggerService.log(JSON.stringify({
            message: '---DECIDE TO GENERATE---',
            service: 'SelfRagService',
            method: 'decideToGenerate',
        }));
        const filteredDocs = state.documents;
        if (filteredDocs.length === 0) {
            this.loggerService.log(JSON.stringify({
                message: '---DECISION: TRANSFORM QUERY---',
                service: 'SelfRagService',
                method: 'decideToGenerate',
            }));
            return 'transformQuery';
        }
        this.loggerService.log(JSON.stringify({
            message: '---DECISION: GENERATE---',
            service: 'SelfRagService',
            method: 'decideToGenerate',
        }));
        return 'generate';
    }
    gradeGenerationVDocuments(state) {
        this.loggerService.log(JSON.stringify({
            message: '---GRADE GENERATION vs DOCUMENTS---',
            service: 'SelfRagService',
            method: 'gradeGenerationVDocuments',
        }));
        const grade = state.generationVDocumentsGrade;
        if (grade === 'yes') {
            this.loggerService.log(JSON.stringify({
                message: '---DECISION: SUPPORTED, MOVE TO FINAL GRADE---',
                service: 'SelfRagService',
                method: 'gradeGenerationVDocuments',
            }));
            return 'supported';
        }
        this.loggerService.log(JSON.stringify({
            message: '---DECISION: NOT SUPPORTED, GENERATE AGAIN---',
            service: 'SelfRagService',
            method: 'gradeGenerationVDocuments',
        }));
        return 'not supported';
    }
    gradeGenerationVQuestion(state) {
        this.loggerService.log(JSON.stringify({
            message: '---GRADE GENERATION vs QUESTION---',
            service: 'SelfRagService',
            method: 'gradeGenerationVQuestion',
        }));
        const grade = state.generationVQuestionGrade;
        if (grade === 'yes') {
            this.loggerService.log(JSON.stringify({
                message: '---DECISION: USEFUL---',
                service: 'SelfRagService',
                method: 'gradeGenerationVQuestion',
            }));
            return 'useful';
        }
        this.loggerService.log(JSON.stringify({
            message: '---DECISION: NOT USEFUL---',
            service: 'SelfRagService',
            method: 'gradeGenerationVQuestion',
        }));
        return 'not useful';
    }
    async getGraph() {
        try {
            const workflow = new langgraph_3.StateGraph(this.GraphState)
                .addNode('retrieve', this.retrieve.bind(this))
                .addNode('gradeDocuments', this.gradeDocuments.bind(this))
                .addNode('generate', this.generate.bind(this))
                .addNode('generateGenerationVDocumentsGrade', this.generateGenerationVDocumentsGrade.bind(this))
                .addNode('transformQuery', this.transformQuery.bind(this))
                .addNode('generateGenerationVQuestionGrade', this.generateGenerationVQuestionGrade.bind(this));
            workflow.addEdge(langgraph_3.START, 'retrieve');
            workflow.addEdge('retrieve', 'gradeDocuments');
            workflow.addConditionalEdges('gradeDocuments', this.decideToGenerate.bind(this), {
                transformQuery: 'transformQuery',
                generate: 'generate',
            });
            workflow.addEdge('transformQuery', 'retrieve');
            workflow.addEdge('generate', 'generateGenerationVDocumentsGrade');
            workflow.addConditionalEdges('generateGenerationVDocumentsGrade', this.gradeGenerationVDocuments.bind(this), {
                supported: 'generateGenerationVQuestionGrade',
                'not supported': 'generate',
            });
            workflow.addConditionalEdges('generateGenerationVQuestionGrade', this.gradeGenerationVQuestion.bind(this), {
                useful: langgraph_3.END,
                'not useful': 'transformQuery',
            });
            const memory = new langgraph_1.MemorySaver();
            return workflow.compile({ checkpointer: memory });
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error building Self-RAG graph',
                service: 'SelfRagService',
                method: 'getGraph',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async askAgent(question, threadId = 'default') {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Starting Self-RAG query',
                service: 'SelfRagService',
                method: 'askAgent',
                question,
                threadId,
            }));
            const auditDataFilter = await this.llm.invoke([
                new messages_1.SystemMessage(`You are an audit data assistant. You should determine if the user's question is related to audit data.
          If the question is about audit data, respond with "RELEVANT".
          If the question is not about audit data, respond with "NOT RELEVANT".
          Only respond with one of these two options.`),
                new messages_2.HumanMessage(question),
            ]);
            const filterContent = typeof auditDataFilter.content === 'string'
                ? auditDataFilter.content
                : JSON.stringify(auditDataFilter.content);
            if (filterContent.includes('NOT RELEVANT')) {
                this.loggerService.log(JSON.stringify({
                    message: 'Question not relevant to audit data',
                    service: 'SelfRagService',
                    method: 'askAgent',
                    question,
                }));
                return "I'm sorry, I can only answer questions related to audit data.";
            }
            const response = await this.app.invoke({
                question,
                documents: [],
                generation: '',
                generationVQuestionGrade: '',
                generationVDocumentsGrade: '',
            }, {
                configurable: {
                    thread_id: threadId,
                },
                recursionLimit: 50,
            });
            this.loggerService.log(JSON.stringify({
                message: 'Self-RAG query completed successfully',
                service: 'SelfRagService',
                method: 'askAgent',
                responseLength: response.generation.length,
            }));
            return response.generation;
        }
        catch (error) {
            console.log({ error });
            this.loggerService.error(JSON.stringify({
                message: 'Error asking Self-RAG agent',
                service: 'SelfRagService',
                method: 'askAgent',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                question,
                threadId,
            }));
            throw new common_1.HttpException('Error asking agent', common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.SelfRagService = SelfRagService;
exports.SelfRagService = SelfRagService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.DatabaseService,
        config_service_1.ConfigService,
        logger_service_1.LoggerService])
], SelfRagService);
//# sourceMappingURL=self-rag.service.js.map