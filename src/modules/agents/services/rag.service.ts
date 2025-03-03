import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { MemorySaver } from '@langchain/langgraph';

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import {
  Annotation,
  AnnotationRoot,
  BinaryOperatorAggregate,
  CompiledStateGraph,
} from '@langchain/langgraph';
import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { createRetrieverTool } from 'langchain/tools/retriever';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { HNSWLib } from '@langchain/community/vectorstores/hnswlib';
import { END, START } from '@langchain/langgraph';
import { pull } from 'langchain/hub';
import { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AIMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
import { StateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { DatabaseService } from '@/common/db/db.service';
import { ConfigService } from '@/common/config/services/config.service';

import * as path from 'path';
import * as fs from 'fs/promises';
import { LoggerService } from '@/common/logger/services/logger.service';

@Injectable()
export class RagService implements OnModuleInit {
  private embeddings: OpenAIEmbeddings;
  private GraphState: AnnotationRoot<{
    messages: BinaryOperatorAggregate<BaseMessage[], BaseMessage[]>;
  }>;
  private llm: ChatAnthropic;
  private tool: any;
  private tools: any[];
  private toolNode: ToolNode;
  private vectorStore: HNSWLib;
  private readonly vectorStorePath: string;
  private app: CompiledStateGraph<any, any, any, any, any, any>;
  private conversationMemory: Map<string, BaseMessage[]> = new Map();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {
    this.vectorStorePath = path.join(process.cwd(), 'vector_store');
  }

  async onModuleInit() {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Initializing RAG service',
          service: 'RagService',
          method: 'onModuleInit',
        }),
      );

      await this.initialize();

      const compiledGraph = await this.getGraph();
      if (compiledGraph) {
        this.app = compiledGraph;
        this.loggerService.log(
          JSON.stringify({
            message: 'Graph compiled successfully',
            service: 'RagService',
            method: 'onModuleInit',
          }),
        );
      } else {
        throw new Error('Failed to compile graph');
      }
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error initializing RAG service',
          service: 'RagService',
          method: 'onModuleInit',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  async initialize(createVectorStore: boolean = false) {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Starting RAG service initialization',
          service: 'RagService',
          method: 'initialize',
          createVectorStore,
        }),
      );

      this.embeddings = new OpenAIEmbeddings({
        apiKey: this.configService.get('OPENAI_API_KEY'),
      });

      this.GraphState = Annotation.Root({
        messages: Annotation<BaseMessage[]>({
          reducer: (x, y) => x.concat(y),
          default: () => [],
        }),
      });

      this.llm = new ChatAnthropic({
        apiKey: this.configService.get('ANTHROPIC_API_KEY'),
        modelName: this.configService.get('AI_MODEL'),
      });

      this.loggerService.log(
        JSON.stringify({
          message: 'LLM and embeddings initialized',
          service: 'RagService',
          method: 'initialize',
          model: this.configService.get('AI_MODEL'),
        }),
      );

      if (createVectorStore) {
        const auditData = await this.databaseService.auditDataForVectorStore();
        await this.createVectorStore(
          auditData as string,
          `${this.vectorStorePath}/audit_data`,
          'audit_data',
        );

        const observationData =
          await this.databaseService.observationDataForVectorStore();
        await this.createVectorStore(
          observationData as string,
          `${this.vectorStorePath}/observation_data`,
          'observation_data',
        );
      }

      this.loggerService.log(
        JSON.stringify({
          message: 'Vector store loaded',
          service: 'RagService',
          method: 'initialize',
        }),
      );

      const auditDataRetriever = await this.loadVectorStoreAsRetriever(
        `${this.vectorStorePath}/audit_data`,
      );

      const observationDataRetriever = await this.loadVectorStoreAsRetriever(
        `${this.vectorStorePath}/observation_data`,
      );

      if (!auditDataRetriever || !observationDataRetriever) {
        throw new Error('Vector store not initialized');
      }

      const auditDataTool = createRetrieverTool(auditDataRetriever, {
        name: 'retrieve_audit_data',
        description: 'Search and return information about audit data.',
      });

      const observationDataTool = createRetrieverTool(
        observationDataRetriever,
        {
          name: 'retrieve_observation_data',
          description: 'Search and return information about observation data.',
        },
      );

      this.tools = [auditDataTool, observationDataTool];
      this.toolNode = new ToolNode<typeof this.GraphState.State>(this.tools);

      this.loggerService.log(
        JSON.stringify({
          message: 'Tools and retriever initialized',
          service: 'RagService',
          method: 'initialize',
          tools: this.tools.map((t) => t.name),
        }),
      );
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error in RAG initialization',
          service: 'RagService',
          method: 'initialize',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          createVectorStore,
        }),
      );
      throw error;
    }
  }

  async createVectorStore(
    data: string,
    vectorStorePath: string,
    sourceName?: string,
  ) {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Creating vector store',
          service: 'RagService',
          method: 'createVectorStore',
          dataLength: data.length,
        }),
      );

      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 50,
      });
      const docSplits = await textSplitter.splitText(data);

      await fs.mkdir(path.dirname(vectorStorePath), { recursive: true });

      const vectorStore = await HNSWLib.fromTexts(
        docSplits,
        [{ source: sourceName }],
        this.embeddings,
      );

      await vectorStore.save(vectorStorePath);

      this.loggerService.log(
        JSON.stringify({
          message: 'Vector store created and saved successfully',
          service: 'RagService',
          method: 'createVectorStore',
          documentCount: docSplits.length,
          path: this.vectorStorePath,
        }),
      );
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error creating vector store',
          service: 'RagService',
          method: 'createVectorStore',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  async loadVectorStoreAsRetriever(vectorStorePath: string) {
    const vectorStore = await HNSWLib.load(vectorStorePath, this.embeddings);
    const retriever = vectorStore.asRetriever();
    return retriever;
  }

  async similaritySearch(query: string, vectorStorePath: string, k = 4) {
    const vectorStore = await HNSWLib.load(vectorStorePath, this.embeddings);
    if (!vectorStore) {
      throw new Error('Vector store not initialized');
    }
    return await vectorStore.similaritySearchWithScore(query, k);
  }

  // ************ Edges ************

  /**
   * Decides whether the agent should retrieve more information or end the process.
   * This function checks the last message in the state for a function call. If a tool call is
   * present, the process continues to retrieve information. Otherwise, it ends the process.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {string} - A decision to either "continue" the retrieval process or "end" it.
   */
  shouldRetrieve(state: typeof this.GraphState.State): string {
    const { messages } = state;
    this.loggerService.log(
      JSON.stringify({
        message: 'Deciding whether to retrieve',
        service: 'RagService',
        method: 'shouldRetrieve',
        messageCount: messages.length,
      }),
    );

    const lastMessage = messages[messages.length - 1];

    if (
      'tool_calls' in lastMessage &&
      Array.isArray(lastMessage.tool_calls) &&
      lastMessage.tool_calls.length
    ) {
      this.loggerService.log(
        JSON.stringify({
          message: 'Decision: Retrieve',
          service: 'RagService',
          method: 'shouldRetrieve',
          toolCalls: lastMessage.tool_calls.map((tc) => tc.name),
        }),
      );
      return 'retrieve';
    }

    this.loggerService.log(
      JSON.stringify({
        message: 'Decision: End',
        service: 'RagService',
        method: 'shouldRetrieve',
      }),
    );
    // If there are no tool calls then we finish.
    return END;
  }

  /**
   * Determines whether the Agent should continue based on the relevance of retrieved documents.
   * This function checks if the last message in the conversation is of type FunctionMessage, indicating
   * that document retrieval has been performed. It then evaluates the relevance of these documents to the user's
   * initial question using a predefined model and output parser. If the documents are relevant, the conversation
   * is considered complete. Otherwise, the retrieval process is continued.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  async gradeDocuments(
    state: typeof this.GraphState.State,
  ): Promise<Partial<typeof this.GraphState.State>> {
    console.log('---GET RELEVANCE---');

    const { messages } = state;
    const tool = {
      name: 'give_relevance_score',
      description: 'Give a relevance score to the retrieved documents.',
      schema: z.object({
        binaryScore: z.string().describe("Relevance score 'yes' or 'no'"),
      }),
    };

    const prompt = ChatPromptTemplate.fromTemplate(
      `You are a grader assessing relevance of retrieved docs to a user question.
  Here are the retrieved docs:
  \n ------- \n
  {context} 
  \n ------- \n
  Here is the user question: {question}
  If the content of the docs are relevant to the users question, score them as relevant.
  Give a binary score 'yes' or 'no' score to indicate whether the docs are relevant to the question.
  Yes: The docs are relevant to the question.
  No: The docs are not relevant to the question.`,
    );

    const model = this.llm.bindTools([tool], {
      tool_choice: tool.name,
    });

    const chain = prompt.pipe(model);

    const lastMessage = messages[messages.length - 1];

    const score = await chain.invoke({
      question: messages[0].content as string,
      context: lastMessage.content as string,
    });

    return {
      messages: [score],
    };
  }

  /**
   * Check the relevance of the previous LLM tool call.
   *
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {string} - A directive to either "yes" or "no" based on the relevance of the documents.
   */
  checkRelevance(state: typeof this.GraphState.State): string {
    console.log('---CHECK RELEVANCE---');

    const { messages } = state;
    const lastMessage = messages[messages.length - 1];
    if (!('tool_calls' in lastMessage)) {
      throw new Error(
        "The 'checkRelevance' node requires the most recent message to contain tool calls.",
      );
    }
    const toolCalls = (lastMessage as AIMessage).tool_calls;
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

  // Nodes

  /**
   * Invokes the agent model to generate a response based on the current state.
   * This function calls the agent model to generate a response to the current conversation state.
   * The response is added to the state's messages.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  async agent(
    state: typeof this.GraphState.State,
  ): Promise<Partial<typeof this.GraphState.State>> {
    this.loggerService.log(
      JSON.stringify({
        message: 'Calling agent',
        service: 'RagService',
        method: 'agent',
        messageCount: state.messages.length,
        firstMessageContent:
          state.messages.length > 0
            ? typeof state.messages[0].content === 'string'
              ? state.messages[0].content.substring(0, 100) + '...'
              : 'Non-string content'
            : 'No messages',
      }),
    );

    const { messages } = state;
    // Find the AIMessage which contains the `give_relevance_score` tool call,
    // and remove it if it exists. This is because the agent does not need to know
    // the relevance score.
    const filteredMessages = messages.filter((message) => {
      if (
        'tool_calls' in message &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length > 0
      ) {
        return message.tool_calls[0].name !== 'give_relevance_score';
      }
      return true;
    });

    const model = this.llm.bindTools(this.tools);

    try {
      const systemMessage = new SystemMessage(
        `You are a helpful assistant that can answer questions based the audit data on Audit Data and Observation Data. IF user ask anything inrelevant or out of context question don't answer and say "I'm sorry, I can only answer questions based on the audit data and observation data."
        if user ask about audit data, use the retrieve_audit_data tool.
        if user ask about observation data, use the retrieve_observation_data tool.
        NOTE: You should answer the question based on the context but if context has any other information other then question then modify the information in context to answer the question.
        NOTE: Answer should be in markdown format.
        NOTE: Pay attention to the most recent question from the user and answer it specifically, while maintaining context from previous questions if relevant.
        `,
        
      );
      
      const response = await model.invoke([systemMessage, ...filteredMessages]);

      this.loggerService.log(
        JSON.stringify({
          message: 'Agent response received',
          service: 'RagService',
          method: 'agent',
          hasToolCalls:
            'tool_calls' in response && Array.isArray(response.tool_calls),
          toolCallCount:
            'tool_calls' in response && Array.isArray(response.tool_calls)
              ? response.tool_calls.length
              : 0,
        }),
      );

      return {
        messages: [response],
      };
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error in agent invocation',
          service: 'RagService',
          method: 'agent',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  /**
   * Transform the query to produce a better question.
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  async rewrite(
    state: typeof this.GraphState.State,
  ): Promise<Partial<typeof this.GraphState.State>> {
    console.log('---TRANSFORM QUERY---');

    const { messages } = state;
    const question = messages[0].content as string;
    const prompt = ChatPromptTemplate.fromTemplate(
      `Look at the input and try to reason about the underlying semantic intent / meaning. \n 
Here is the initial question:
\n ------- \n
{question} 
\n ------- \n
Formulate an improved question:`,
    );

    // Grader
    const model = this.llm;
    const response = await prompt.pipe(model).invoke({ question });
    return {
      messages: [response],
    };
  }

  /**
   * Generate answer
   * @param {typeof GraphState.State} state - The current state of the agent, including all messages.
   * @returns {Promise<Partial<typeof GraphState.State>>} - The updated state with the new message added to the list of messages.
   */
  async generate(
    state: typeof this.GraphState.State,
  ): Promise<Partial<typeof this.GraphState.State>> {
    console.log('---GENERATE---');

    const { messages } = state;
    const question = messages[0].content as string;
    // Extract the most recent ToolMessage
    const lastToolMessage = messages
      .slice()
      .reverse()
      .find((msg) => msg.getType() === 'tool');
    if (!lastToolMessage) {
      throw new Error('No tool message found in the conversation history');
    }

    const docs = lastToolMessage.content as string;

    const prompt = await pull<ChatPromptTemplate>('rlm/rag-prompt');

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

  //   GRAPH
  async getGraph() {
    const workflow = new StateGraph(this.GraphState);
    const checkpointer = new MemorySaver();

    // Define the nodes which we'll cycle between.
    workflow
      .addNode('agent', this.agent.bind(this))
      .addNode('retrieve', this.toolNode)
      .addNode('gradeDocuments', this.gradeDocuments.bind(this))
      .addNode('rewrite', this.rewrite.bind(this))
      .addNode('generate', this.generate.bind(this));

    // Call agent node to decide to retrieve or not
    workflow.addEdge(START, 'agent' as any);

    // Decide whether to retrieve
    workflow.addConditionalEdges(
      'agent' as any,
      // Assess agent decision
      this.shouldRetrieve.bind(this),
    );

    workflow.addEdge('retrieve' as any, 'gradeDocuments' as any);

    // Edges taken after the `action` node is called.
    workflow.addConditionalEdges(
      'gradeDocuments' as any,
      // Assess agent decision
      this.checkRelevance.bind(this),
      {
        yes: 'generate' as any,
        no: 'rewrite' as any,
      },
    );

    workflow.addEdge('generate' as any, END);
    workflow.addEdge('rewrite' as any, 'agent' as any);

    // Compile the workflow before returning
    // return workflow.compile({ checkpointer });
    return workflow.compile();
  }

  getTokenUsage(response: any[]) {
    return response.reduce((acc, message) => {
      if (message?.kwargs?.usage_metadata) {
        acc += message?.kwargs?.usage_metadata?.total_tokens;
      }
      return acc;
    }, 0);
  }

  async askAgent(question: string, threadId: string = 'default') {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Starting agent query',
          service: 'RagService',
          method: 'askAgent',
          question,
          threadId,
        }),
      );

      // Generate a unique thread ID for each question to prevent context carryover
      const uniqueThreadId = `${threadId}_${Date.now()}`;

      const response = await this.app.invoke(
        {
          messages: [new HumanMessage(`
            question: ${question}
            NOTE: STRICKLY DON'T Mention something like the based on the context or source of the information, just give answer plain and simple
        EXAMPLE:
        IT SHOULD NOT BE LIKE THIS:
        Based on the context, the risk-wise breached observations are: High (152), Medium (131), and Low (34). This indicates that high-risk breaches constitute the largest category, followed closely by medium-risk breaches, with low-risk breaches representing the smallest portion.

        IT SHOULD BE LIKE THIS:
        The risk-wise breached observations are: High (152), Medium (131), and Low (34). This indicates that high-risk breaches constitute the largest category, followed closely by medium-risk breaches, with low-risk breaches representing the smallest portion.
            `)],
        },
        {
          configurable: {
            thread_id: uniqueThreadId,
          },
        },
      );

      this.loggerService.log(
        JSON.stringify({
          message: 'Agent query completed successfully',
          service: 'RagService',
          method: 'askAgent',
          messageCount: response.messages.length,
          responseLength:
            response.messages[response.messages.length - 1].content.length,
          threadId: uniqueThreadId,
        }),
      );
      

      return response.messages[response.messages.length - 1].content;
    } catch (error) {
      console.log({ error });
      this.loggerService.error(
        JSON.stringify({
          message: 'Error asking agent',
          service: 'RagService',
          method: 'askAgent',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          question,
          threadId,
        }),
      );
      throw new HttpException(
        'Error asking agent',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
