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
exports.RagService = void 0;
const common_1 = require("@nestjs/common");
const langgraph_1 = require("@langchain/langgraph");
const textsplitters_1 = require("@langchain/textsplitters");
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
const langgraph_4 = require("@langchain/langgraph");
const messages_2 = require("@langchain/core/messages");
const db_service_1 = require("../../../common/db/db.service");
const config_service_1 = require("../../../common/config/services/config.service");
const path = require("path");
const fs = require("fs/promises");
const logger_service_1 = require("../../../common/logger/services/logger.service");
let RagService = class RagService {
    constructor(databaseService, configService, loggerService) {
        this.databaseService = databaseService;
        this.configService = configService;
        this.loggerService = loggerService;
        this.conversationMemory = new Map();
        this.vectorStorePath = path.join(process.cwd(), 'vector_store');
    }
    async onModuleInit() {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Initializing RAG service',
                service: 'RagService',
                method: 'onModuleInit',
            }));
            await this.initialize();
            const compiledGraph = await this.getGraph();
            if (compiledGraph) {
                this.app = compiledGraph;
                this.loggerService.log(JSON.stringify({
                    message: 'Graph compiled successfully',
                    service: 'RagService',
                    method: 'onModuleInit',
                }));
            }
            else {
                throw new Error('Failed to compile graph');
            }
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error initializing RAG service',
                service: 'RagService',
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
                message: 'Starting RAG service initialization',
                service: 'RagService',
                method: 'initialize',
                createVectorStore,
            }));
            this.embeddings = new openai_1.OpenAIEmbeddings({
                apiKey: this.configService.get('OPENAI_API_KEY'),
            });
            this.GraphState = langgraph_2.Annotation.Root({
                messages: (0, langgraph_2.Annotation)({
                    reducer: (x, y) => x.concat(y),
                    default: () => [],
                }),
            });
            this.llm = new anthropic_1.ChatAnthropic({
                apiKey: this.configService.get('ANTHROPIC_API_KEY'),
                modelName: this.configService.get('AI_MODEL'),
            });
            this.loggerService.log(JSON.stringify({
                message: 'LLM and embeddings initialized',
                service: 'RagService',
                method: 'initialize',
                model: this.configService.get('AI_MODEL'),
            }));
            if (createVectorStore) {
                const auditData = await this.databaseService.auditDataForVectorStore();
                await this.createVectorStore(auditData, `${this.vectorStorePath}/audit_data`, 'audit_data');
                const observationData = await this.databaseService.observationDataForVectorStore();
                await this.createVectorStore(observationData, `${this.vectorStorePath}/observation_data`, 'observation_data');
            }
            this.loggerService.log(JSON.stringify({
                message: 'Vector store loaded',
                service: 'RagService',
                method: 'initialize',
            }));
            const auditDataRetriever = await this.loadVectorStoreAsRetriever(`${this.vectorStorePath}/audit_data`);
            const observationDataRetriever = await this.loadVectorStoreAsRetriever(`${this.vectorStorePath}/observation_data`);
            if (!auditDataRetriever || !observationDataRetriever) {
                throw new Error('Vector store not initialized');
            }
            const auditDataTool = (0, retriever_1.createRetrieverTool)(auditDataRetriever, {
                name: 'retrieve_audit_data',
                description: 'Search and return information about audit data.',
            });
            const observationDataTool = (0, retriever_1.createRetrieverTool)(observationDataRetriever, {
                name: 'retrieve_observation_data',
                description: 'Search and return information about observation data.',
            });
            this.tools = [auditDataTool, observationDataTool];
            this.toolNode = new prebuilt_1.ToolNode(this.tools);
            this.loggerService.log(JSON.stringify({
                message: 'Tools and retriever initialized',
                service: 'RagService',
                method: 'initialize',
                tools: this.tools.map((t) => t.name),
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error in RAG initialization',
                service: 'RagService',
                method: 'initialize',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                createVectorStore,
            }));
            throw error;
        }
    }
    async createVectorStore(data, vectorStorePath, sourceName) {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Creating vector store',
                service: 'RagService',
                method: 'createVectorStore',
                dataLength: data.length,
            }));
            const textSplitter = new textsplitters_1.RecursiveCharacterTextSplitter({
                chunkSize: 500,
                chunkOverlap: 50,
            });
            const docSplits = await textSplitter.splitText(data);
            await fs.mkdir(path.dirname(vectorStorePath), { recursive: true });
            const vectorStore = await hnswlib_1.HNSWLib.fromTexts(docSplits, [{ source: sourceName }], this.embeddings);
            await vectorStore.save(vectorStorePath);
            this.loggerService.log(JSON.stringify({
                message: 'Vector store created and saved successfully',
                service: 'RagService',
                method: 'createVectorStore',
                documentCount: docSplits.length,
                path: this.vectorStorePath,
            }));
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error creating vector store',
                service: 'RagService',
                method: 'createVectorStore',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async loadVectorStoreAsRetriever(vectorStorePath) {
        const vectorStore = await hnswlib_1.HNSWLib.load(vectorStorePath, this.embeddings);
        const retriever = vectorStore.asRetriever();
        return retriever;
    }
    async similaritySearch(query, vectorStorePath, k = 4) {
        const vectorStore = await hnswlib_1.HNSWLib.load(vectorStorePath, this.embeddings);
        if (!vectorStore) {
            throw new Error('Vector store not initialized');
        }
        return await vectorStore.similaritySearchWithScore(query, k);
    }
    shouldRetrieve(state) {
        const { messages } = state;
        this.loggerService.log(JSON.stringify({
            message: 'Deciding whether to retrieve',
            service: 'RagService',
            method: 'shouldRetrieve',
            messageCount: messages.length,
        }));
        const lastMessage = messages[messages.length - 1];
        if ('tool_calls' in lastMessage &&
            Array.isArray(lastMessage.tool_calls) &&
            lastMessage.tool_calls.length) {
            this.loggerService.log(JSON.stringify({
                message: 'Decision: Retrieve',
                service: 'RagService',
                method: 'shouldRetrieve',
                toolCalls: lastMessage.tool_calls.map((tc) => tc.name),
            }));
            return 'retrieve';
        }
        this.loggerService.log(JSON.stringify({
            message: 'Decision: End',
            service: 'RagService',
            method: 'shouldRetrieve',
        }));
        return langgraph_3.END;
    }
    async gradeDocuments(state) {
        console.log('---GET RELEVANCE---');
        const { messages } = state;
        const tool = {
            name: 'give_relevance_score',
            description: 'Give a relevance score to the retrieved documents.',
            schema: zod_1.z.object({
                binaryScore: zod_1.z.string().describe("Relevance score 'yes' or 'no'"),
            }),
        };
        const prompt = prompts_1.ChatPromptTemplate.fromTemplate(`You are a grader assessing relevance of retrieved docs to a user question.
  Here are the retrieved docs:
  \n ------- \n
  {context} 
  \n ------- \n
  Here is the user question: {question}
  If the content of the docs are relevant to the users question, score them as relevant.
  Give a binary score 'yes' or 'no' score to indicate whether the docs are relevant to the question.
  Yes: The docs are relevant to the question.
  No: The docs are not relevant to the question.`);
        const model = this.llm.bindTools([tool], {
            tool_choice: tool.name,
        });
        const chain = prompt.pipe(model);
        const lastMessage = messages[messages.length - 1];
        const score = await chain.invoke({
            question: messages[0].content,
            context: lastMessage.content,
        });
        return {
            messages: [score],
        };
    }
    checkRelevance(state) {
        console.log('---CHECK RELEVANCE---');
        const { messages } = state;
        const lastMessage = messages[messages.length - 1];
        if (!('tool_calls' in lastMessage)) {
            throw new Error("The 'checkRelevance' node requires the most recent message to contain tool calls.");
        }
        const toolCalls = lastMessage.tool_calls;
        if (!toolCalls || !toolCalls.length) {
            throw new Error('Last message was not a function message');
        }
        if (toolCalls[0].args.binaryScore === 'yes') {
            console.log('---DECISION: DOCS RELEVANT---');
            return 'yes';
        }
        console.log('---DECISION: DOCS NOT RELEVANT---');
        return 'no';
    }
    async agent(state) {
        this.loggerService.log(JSON.stringify({
            message: 'Calling agent',
            service: 'RagService',
            method: 'agent',
            messageCount: state.messages.length,
            firstMessageContent: state.messages.length > 0
                ? typeof state.messages[0].content === 'string'
                    ? state.messages[0].content.substring(0, 100) + '...'
                    : 'Non-string content'
                : 'No messages',
        }));
        const { messages } = state;
        const filteredMessages = messages.filter((message) => {
            if ('tool_calls' in message &&
                Array.isArray(message.tool_calls) &&
                message.tool_calls.length > 0) {
                return message.tool_calls[0].name !== 'give_relevance_score';
            }
            return true;
        });
        const model = this.llm.bindTools(this.tools);
        try {
            const systemMessage = new messages_1.SystemMessage(`You are a helpful assistant that can answer questions based the audit data on Audit Data and Observation Data. IF user ask anything inrelevant or out of context question don't answer and say "I'm sorry, I can only answer questions based on the audit data and observation data."
        if user ask about audit data, use the retrieve_audit_data tool.
        if user ask about observation data, use the retrieve_observation_data tool.
        NOTE: You should answer the question based on the context but if context has any other information other then question then modify the information in context to answer the question.
        NOTE: Answer should be in markdown format.
        NOTE: Pay attention to the most recent question from the user and answer it specifically, while maintaining context from previous questions if relevant.`);
            console.log([systemMessage, ...filteredMessages]);
            const response = await model.invoke([systemMessage, ...filteredMessages]);
            this.loggerService.log(JSON.stringify({
                message: 'Agent response received',
                service: 'RagService',
                method: 'agent',
                hasToolCalls: 'tool_calls' in response && Array.isArray(response.tool_calls),
                toolCallCount: 'tool_calls' in response && Array.isArray(response.tool_calls)
                    ? response.tool_calls.length
                    : 0,
            }));
            return {
                messages: [response],
            };
        }
        catch (error) {
            this.loggerService.error(JSON.stringify({
                message: 'Error in agent invocation',
                service: 'RagService',
                method: 'agent',
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            }));
            throw error;
        }
    }
    async rewrite(state) {
        console.log('---TRANSFORM QUERY---');
        const { messages } = state;
        const question = messages[0].content;
        const prompt = prompts_1.ChatPromptTemplate.fromTemplate(`Look at the input and try to reason about the underlying semantic intent / meaning. \n 
Here is the initial question:
\n ------- \n
{question} 
\n ------- \n
Formulate an improved question:`);
        const model = this.llm;
        const response = await prompt.pipe(model).invoke({ question });
        return {
            messages: [response],
        };
    }
    async generate(state) {
        console.log('---GENERATE---');
        const { messages } = state;
        const question = messages[0].content;
        const lastToolMessage = messages
            .slice()
            .reverse()
            .find((msg) => msg.getType() === 'tool');
        if (!lastToolMessage) {
            throw new Error('No tool message found in the conversation history');
        }
        const docs = lastToolMessage.content;
        const prompt = await (0, hub_1.pull)('rlm/rag-prompt');
        const llm = this.llm;
        const ragChain = prompt.pipe(llm);
        const response = await ragChain.invoke({
            context: docs,
            question,
        });
        return {
            messages: [response],
        };
    }
    async getGraph() {
        const workflow = new langgraph_4.StateGraph(this.GraphState);
        const checkpointer = new langgraph_1.MemorySaver();
        workflow
            .addNode('agent', this.agent.bind(this))
            .addNode('retrieve', this.toolNode)
            .addNode('gradeDocuments', this.gradeDocuments.bind(this))
            .addNode('rewrite', this.rewrite.bind(this))
            .addNode('generate', this.generate.bind(this));
        workflow.addEdge(langgraph_3.START, 'agent');
        workflow.addConditionalEdges('agent', this.shouldRetrieve.bind(this));
        workflow.addEdge('retrieve', 'gradeDocuments');
        workflow.addConditionalEdges('gradeDocuments', this.checkRelevance.bind(this), {
            yes: 'generate',
            no: 'rewrite',
        });
        workflow.addEdge('generate', langgraph_3.END);
        workflow.addEdge('rewrite', 'agent');
        return workflow.compile();
    }
    getTokenUsage(response) {
        return response.reduce((acc, message) => {
            if (message?.kwargs?.usage_metadata) {
                acc += message?.kwargs?.usage_metadata?.total_tokens;
            }
            return acc;
        }, 0);
    }
    async askAgent(question, threadId = 'default') {
        try {
            this.loggerService.log(JSON.stringify({
                message: 'Starting agent query',
                service: 'RagService',
                method: 'askAgent',
                question,
                threadId,
            }));
            const uniqueThreadId = `${threadId}_${Date.now()}`;
            const response = await this.app.invoke({
                messages: [new messages_2.HumanMessage(question)],
            }, {
                configurable: {
                    thread_id: uniqueThreadId,
                },
            });
            this.loggerService.log(JSON.stringify({
                message: 'Agent query completed successfully',
                service: 'RagService',
                method: 'askAgent',
                messageCount: response.messages.length,
                responseLength: response.messages[response.messages.length - 1].content.length,
                threadId: uniqueThreadId,
            }));
            return response.messages[response.messages.length - 1].content;
        }
        catch (error) {
            console.log({ error });
            this.loggerService.error(JSON.stringify({
                message: 'Error asking agent',
                service: 'RagService',
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
exports.RagService = RagService;
exports.RagService = RagService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.DatabaseService,
        config_service_1.ConfigService,
        logger_service_1.LoggerService])
], RagService);
//# sourceMappingURL=rag.service.js.map