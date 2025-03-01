import { OnModuleInit } from '@nestjs/common';
import { BinaryOperatorAggregate, CompiledStateGraph } from '@langchain/langgraph';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { DatabaseService } from '@/common/db/db.service';
import { ConfigService } from '@/common/config/services/config.service';
import { Document } from '@langchain/core/documents';
import { LoggerService } from '@/common/logger/services/logger.service';
import { RunnableConfig } from '@langchain/core/runnables';
export declare class SelfRagService implements OnModuleInit {
    private readonly databaseService;
    private readonly configService;
    private readonly loggerService;
    private embeddings;
    private GraphState;
    private llm;
    private tool;
    private tools;
    private toolNode;
    private vectorStore;
    private readonly vectorStorePath;
    private app;
    private retriever;
    constructor(databaseService: DatabaseService, configService: ConfigService, loggerService: LoggerService);
    onModuleInit(): Promise<void>;
    initialize(createVectorStore?: boolean): Promise<void>;
    loadVectorStore(): Promise<void>;
    createVectorStore(): Promise<void>;
    loadVectorStoreAsRetriever(): Promise<import("@langchain/core/vectorstores").VectorStoreRetriever<HNSWLib>>;
    similaritySearch(query: string, k?: number): Promise<import("@langchain/core/documents").DocumentInterface<Record<string, any>>[]>;
    retrieve(state: typeof this.GraphState.State, config?: RunnableConfig): Promise<Partial<typeof this.GraphState.State>>;
    generate(state: typeof this.GraphState.State): Promise<Partial<typeof this.GraphState.State>>;
    gradeDocuments(state: typeof this.GraphState.State): Promise<Partial<typeof this.GraphState.State>>;
    transformQuery(state: typeof this.GraphState.State): Promise<Partial<typeof this.GraphState.State>>;
    generateGenerationVDocumentsGrade(state: typeof this.GraphState.State): Promise<Partial<typeof this.GraphState.State>>;
    generateGenerationVQuestionGrade(state: typeof this.GraphState.State): Promise<Partial<typeof this.GraphState.State>>;
    decideToGenerate(state: typeof this.GraphState.State): "generate" | "transformQuery";
    gradeGenerationVDocuments(state: typeof this.GraphState.State): "supported" | "not supported";
    gradeGenerationVQuestion(state: typeof this.GraphState.State): "useful" | "not useful";
    getGraph(): Promise<CompiledStateGraph<import("@langchain/langgraph").StateType<{
        documents: BinaryOperatorAggregate<Document[], Document[]>;
        question: BinaryOperatorAggregate<string, string>;
        generation: BinaryOperatorAggregate<string, string>;
        generationVQuestionGrade: BinaryOperatorAggregate<string, string>;
        generationVDocumentsGrade: BinaryOperatorAggregate<string, string>;
    }>, import("@langchain/langgraph").UpdateType<{
        documents: BinaryOperatorAggregate<Document[], Document[]>;
        question: BinaryOperatorAggregate<string, string>;
        generation: BinaryOperatorAggregate<string, string>;
        generationVQuestionGrade: BinaryOperatorAggregate<string, string>;
        generationVDocumentsGrade: BinaryOperatorAggregate<string, string>;
    }>, "__start__" | "retrieve" | "gradeDocuments" | "generate" | "transformQuery" | "generateGenerationVDocumentsGrade" | "generateGenerationVQuestionGrade", {
        documents: BinaryOperatorAggregate<Document[], Document[]>;
        question: BinaryOperatorAggregate<string, string>;
        generation: BinaryOperatorAggregate<string, string>;
        generationVQuestionGrade: BinaryOperatorAggregate<string, string>;
        generationVDocumentsGrade: BinaryOperatorAggregate<string, string>;
    }, {
        documents: BinaryOperatorAggregate<Document[], Document[]>;
        question: BinaryOperatorAggregate<string, string>;
        generation: BinaryOperatorAggregate<string, string>;
        generationVQuestionGrade: BinaryOperatorAggregate<string, string>;
        generationVDocumentsGrade: BinaryOperatorAggregate<string, string>;
    }, import("@langchain/langgraph").StateDefinition>>;
    askAgent(question: string, threadId?: string): Promise<any>;
}
