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
const langgraph_2 = require("@langchain/langgraph");
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
const messages_1 = require("@langchain/core/messages");
const db_service_1 = require("../../../common/db/db.service");
const config_service_1 = require("../../../common/config/services/config.service");
const documents_1 = require("@langchain/core/documents");
const path = require("path");
const fs = require("fs/promises");
let RagService = class RagService {
    constructor(databaseService, configService) {
        this.databaseService = databaseService;
        this.configService = configService;
        this.vectorStorePath = path.join(process.cwd(), 'vector_store');
    }
    async onModuleInit() {
        try {
            await this.initialize();
            const compiledGraph = await this.getGraph();
            if (compiledGraph) {
                this.app = compiledGraph;
                console.log('Graph compiled successfully');
            }
            else {
                throw new Error('Failed to compile graph');
            }
        }
        catch (error) {
            console.error('Error initializing RAG service:', error);
            throw error;
        }
    }
    async initialize(createVectorStore = false) {
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
            modelName: 'claude-3-5-sonnet-20240620',
        });
        if (createVectorStore) {
            await this.createVectorStore();
        }
        await this.loadVectorStore();
        const retriever = await this.loadVectorStoreAsRetriever();
        this.tool = (0, retriever_1.createRetrieverTool)(retriever, {
            name: 'retrieve_audit_data',
            description: 'Search and return information about audit data.',
        });
        this.tools = [this.tool];
        this.toolNode = new prebuilt_1.ToolNode(this.tools);
    }
    async loadVectorStore() {
        this.vectorStore = await hnswlib_1.HNSWLib.load(this.vectorStorePath, this.embeddings);
    }
    async createVectorStore() {
        try {
            await fs.mkdir(path.dirname(this.vectorStorePath), { recursive: true });
            const auditData = await this.databaseService.getAIAuditProgressData();
            const documents = auditData.data.map((item) => {
                return new documents_1.Document({
                    pageContent: JSON.stringify(item),
                    metadata: { source: 'audit_data', loc: item },
                });
            });
            this.vectorStore = await hnswlib_1.HNSWLib.fromDocuments(documents, this.embeddings);
            await this.vectorStore.save(this.vectorStorePath);
        }
        catch (error) {
            console.error('Error creating vector store:', error);
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
    shouldRetrieve(state) {
        const { messages } = state;
        console.log('---DECIDE TO RETRIEVE---');
        const lastMessage = messages[messages.length - 1];
        if ('tool_calls' in lastMessage &&
            Array.isArray(lastMessage.tool_calls) &&
            lastMessage.tool_calls.length) {
            console.log('---DECISION: RETRIEVE---');
            return 'retrieve';
        }
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
        console.log('---CALL AGENT---');
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
        const response = await model.invoke(filteredMessages);
        return {
            messages: [response],
        };
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
        return workflow.compile({ checkpointer });
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
        const response = await this.app.invoke({
            messages: [new messages_1.HumanMessage(question)],
        }, {
            configurable: {
                thread_id: threadId,
            },
        });
        return response.messages[response.messages.length - 1].content;
    }
};
exports.RagService = RagService;
exports.RagService = RagService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.DatabaseService,
        config_service_1.ConfigService])
], RagService);
//# sourceMappingURL=rag.service.js.map