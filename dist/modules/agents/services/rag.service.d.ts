import { OnModuleInit } from '@nestjs/common';
import { BinaryOperatorAggregate, CompiledStateGraph } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { DatabaseService } from '@/common/db/db.service';
import { ConfigService } from '@/common/config/services/config.service';
export declare class RagService implements OnModuleInit {
    private readonly databaseService;
    private readonly configService;
    private embeddings;
    private GraphState;
    private llm;
    private tool;
    private tools;
    private toolNode;
    private vectorStore;
    private readonly vectorStorePath;
    private app;
    constructor(databaseService: DatabaseService, configService: ConfigService);
    onModuleInit(): Promise<void>;
    initialize(createVectorStore?: boolean): Promise<void>;
    loadVectorStore(): Promise<void>;
    createVectorStore(): Promise<void>;
    loadVectorStoreAsRetriever(): Promise<import("@langchain/core/vectorstores").VectorStoreRetriever<HNSWLib>>;
    similaritySearch(query: string, k?: number): Promise<import("@langchain/core/documents").DocumentInterface<Record<string, any>>[]>;
    shouldRetrieve(state: typeof this.GraphState.State): string;
    gradeDocuments(state: typeof this.GraphState.State): Promise<Partial<typeof this.GraphState.State>>;
    checkRelevance(state: typeof this.GraphState.State): string;
    agent(state: typeof this.GraphState.State): Promise<Partial<typeof this.GraphState.State>>;
    rewrite(state: typeof this.GraphState.State): Promise<Partial<typeof this.GraphState.State>>;
    generate(state: typeof this.GraphState.State): Promise<Partial<typeof this.GraphState.State>>;
    getGraph(): Promise<CompiledStateGraph<import("@langchain/langgraph").StateType<{
        messages: BinaryOperatorAggregate<BaseMessage[], BaseMessage[]>;
    }>, import("@langchain/langgraph").UpdateType<{
        messages: BinaryOperatorAggregate<BaseMessage[], BaseMessage[]>;
    }>, "__start__", {
        messages: BinaryOperatorAggregate<BaseMessage[], BaseMessage[]>;
    }, {
        messages: BinaryOperatorAggregate<BaseMessage[], BaseMessage[]>;
    }, import("@langchain/langgraph").StateDefinition>>;
    getTokenUsage(response: any[]): any;
    askAgent(question: string, threadId?: string): Promise<any>;
}
