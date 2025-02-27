import { Injectable, OnModuleInit } from '@nestjs/common';
import { MemorySaver } from '@langchain/langgraph';

import {
  Annotation,
  AnnotationRoot,
  BinaryOperatorAggregate,
  CompiledStateGraph,
} from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
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
import { Document } from '@langchain/core/documents';
import * as path from 'path';
import * as fs from 'fs/promises';

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

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.vectorStorePath = path.join(process.cwd(), 'vector_store');
  }

  async onModuleInit() {
    try {
      await this.initialize();
      const compiledGraph = await this.getGraph();
      if (compiledGraph) {
        this.app = compiledGraph;
        console.log('Graph compiled successfully');
      } else {
        throw new Error('Failed to compile graph');
      }
    } catch (error) {
      console.error('Error initializing RAG service:', error);
      throw error;
    }
  }

  async initialize(createVectorStore: boolean = false) {
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
      modelName: 'claude-3-5-sonnet-20240620',
    });
    if (createVectorStore) {
      await this.createVectorStore();
    }

    await this.loadVectorStore();

    const retriever = await this.loadVectorStoreAsRetriever();

    this.tool = createRetrieverTool(retriever, {
      name: 'retrieve_audit_data',
      description: 'Search and return information about audit data.',
    });
    this.tools = [this.tool];
    this.toolNode = new ToolNode<typeof this.GraphState.State>(this.tools);
  }

  async loadVectorStore() {
    this.vectorStore = await HNSWLib.load(
      this.vectorStorePath,
      this.embeddings,
    );
  }

  async createVectorStore() {
    try {
      await fs.mkdir(path.dirname(this.vectorStorePath), { recursive: true });

      const auditData = await this.databaseService.getAIAuditProgressData();

      const documents = auditData.data.map((item: any) => {
        return new Document({
          pageContent: JSON.stringify(item),
          metadata: { source: 'audit_data', loc: item },
        });
      });

      this.vectorStore = await HNSWLib.fromDocuments(
        documents,
        this.embeddings,
      );

      await this.vectorStore.save(this.vectorStorePath);
    } catch (error) {
      console.error('Error creating vector store:', error);
      throw error;
    }
  }

  async loadVectorStoreAsRetriever() {
    const vectorStore = await HNSWLib.load(
      this.vectorStorePath,
      this.embeddings,
    );
    const retriever = vectorStore.asRetriever();
    return retriever;
  }

  async similaritySearch(query: string, k = 4) {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized');
    }
    return await this.vectorStore.similaritySearch(query, k);
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
    console.log('---DECIDE TO RETRIEVE---');
    const lastMessage = messages[messages.length - 1];

    if (
      'tool_calls' in lastMessage &&
      Array.isArray(lastMessage.tool_calls) &&
      lastMessage.tool_calls.length
    ) {
      console.log('---DECISION: RETRIEVE---');
      return 'retrieve';
    }
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
    console.log('---CALL AGENT---');

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

    const response = await model.invoke(filteredMessages);
    return {
      messages: [response],
    };
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
    return workflow.compile({ checkpointer });
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
    const response = await this.app.invoke(
      {
        messages: [new HumanMessage(question)],
      },
      {
        configurable: {
          thread_id: threadId,
        },
      },
    );

    return response.messages[response.messages.length - 1].content;
  }
}
