import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { MemorySaver } from '@langchain/langgraph';

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
import { END, START, StateGraph } from '@langchain/langgraph';
import { pull } from 'langchain/hub';
import { z } from 'zod';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { OpenAIEmbeddings } from '@langchain/openai';
import { AIMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage } from '@langchain/core/messages';
import { DatabaseService } from '@/common/db/db.service';
import { ConfigService } from '@/common/config/services/config.service';
import { Document } from '@langchain/core/documents';
import * as path from 'path';
import * as fs from 'fs/promises';
import { LoggerService } from '@/common/logger/services/logger.service';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { formatDocumentsAsString } from 'langchain/util/document';
import { RunnableConfig } from '@langchain/core/runnables';

@Injectable()
export class SelfRagService implements OnModuleInit {
  private embeddings: OpenAIEmbeddings;
  private GraphState: AnnotationRoot<{
    documents: BinaryOperatorAggregate<Document[], Document[]>;
    question: BinaryOperatorAggregate<string, string>;
    generation: BinaryOperatorAggregate<string, string>;
    generationVQuestionGrade: BinaryOperatorAggregate<string, string>;
    generationVDocumentsGrade: BinaryOperatorAggregate<string, string>;
  }>;
  private llm: ChatAnthropic;
  private tool: any;
  private tools: any[];
  private toolNode: ToolNode;
  private vectorStore: HNSWLib;
  private readonly vectorStorePath: string;
  private app: CompiledStateGraph<any, any, any, any, any, any>;
  private retriever: any;

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
          message: 'Initializing Self-RAG service',
          service: 'SelfRagService',
          method: 'onModuleInit',
        }),
      );

      //   await this.initialize();

      //   const compiledGraph = await this.getGraph();
      //   if (compiledGraph) {
      //     this.app = compiledGraph;
      //     this.loggerService.log(
      //       JSON.stringify({
      //         message: 'Self-RAG graph compiled successfully',
      //         service: 'SelfRagService',
      //         method: 'onModuleInit',
      //       }),
      //     );
      //   } else {
      //     throw new Error('Failed to compile Self-RAG graph');
      //   }
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error initializing Self-RAG service',
          service: 'SelfRagService',
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
          message: 'Starting Self-RAG service initialization',
          service: 'SelfRagService',
          method: 'initialize',
          createVectorStore,
        }),
      );

      this.embeddings = new OpenAIEmbeddings({
        apiKey: this.configService.get('OPENAI_API_KEY'),
      });

      // Define the state for our Self-RAG graph
      this.GraphState = Annotation.Root({
        documents: Annotation<Document[]>({
          reducer: (x, y) => y ?? x ?? [],
        }),
        question: Annotation<string>({
          reducer: (x, y) => y ?? x ?? '',
        }),
        generation: Annotation<string>({
          reducer: (x, y) => y ?? x,
          default: () => '',
        }),
        generationVQuestionGrade: Annotation<string>({
          reducer: (x, y) => y ?? x,
        }),
        generationVDocumentsGrade: Annotation<string>({
          reducer: (x, y) => y ?? x,
        }),
      });

      this.llm = new ChatAnthropic({
        apiKey: this.configService.get('ANTHROPIC_API_KEY'),
        modelName: 'claude-3-5-sonnet-20240620',
        temperature: 0,
      });

      this.loggerService.log(
        JSON.stringify({
          message: 'LLM and embeddings initialized',
          service: 'SelfRagService',
          method: 'initialize',
          model: 'claude-3-5-sonnet-20240620',
        }),
      );

      if (createVectorStore) {
        await this.createVectorStore();
      }

      await this.loadVectorStore();

      this.loggerService.log(
        JSON.stringify({
          message: 'Vector store loaded',
          service: 'SelfRagService',
          method: 'initialize',
        }),
      );

      this.retriever = await this.loadVectorStoreAsRetriever();

      this.tool = createRetrieverTool(this.retriever, {
        name: 'retrieve_audit_data',
        description: 'Search and return information about audit data.',
      });
      this.tools = [this.tool];
      this.toolNode = new ToolNode<typeof this.GraphState.State>(this.tools);

      this.loggerService.log(
        JSON.stringify({
          message: 'Tools and retriever initialized',
          service: 'SelfRagService',
          method: 'initialize',
          tools: this.tools.map((t) => t.name),
        }),
      );
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error in Self-RAG initialization',
          service: 'SelfRagService',
          method: 'initialize',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          createVectorStore,
        }),
      );
      throw error;
    }
  }

  async loadVectorStore() {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Loading vector store',
          service: 'SelfRagService',
          method: 'loadVectorStore',
          path: this.vectorStorePath,
        }),
      );

      this.vectorStore = await HNSWLib.load(
        this.vectorStorePath,
        this.embeddings,
      );

      this.loggerService.log(
        JSON.stringify({
          message: 'Vector store loaded successfully',
          service: 'SelfRagService',
          method: 'loadVectorStore',
        }),
      );
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error loading vector store',
          service: 'SelfRagService',
          method: 'loadVectorStore',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  async createVectorStore() {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Creating vector store',
          service: 'SelfRagService',
          method: 'createVectorStore',
        }),
      );

      await fs.mkdir(path.dirname(this.vectorStorePath), { recursive: true });

      const auditData = await this.databaseService.getAIAuditProgressData();

      this.loggerService.log(
        JSON.stringify({
          message: 'Retrieved audit data for vector store',
          service: 'SelfRagService',
          method: 'createVectorStore',
          dataCount: auditData.length,
        }),
      );

      const documents = auditData.map((item: any) => {
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

      this.loggerService.log(
        JSON.stringify({
          message: 'Vector store created and saved successfully',
          service: 'SelfRagService',
          method: 'createVectorStore',
          documentCount: documents.length,
          path: this.vectorStorePath,
        }),
      );
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error creating vector store',
          service: 'SelfRagService',
          method: 'createVectorStore',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
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

  // ************ Nodes ************

  /**
   * Retrieve documents from the vector store
   */
  async retrieve(
    state: typeof this.GraphState.State,
    config?: RunnableConfig,
  ): Promise<Partial<typeof this.GraphState.State>> {
    this.loggerService.log(
      JSON.stringify({
        message: '---RETRIEVE---',
        service: 'SelfRagService',
        method: 'retrieve',
      }),
    );

    try {
      const documents = await this.retriever
        .withConfig({ runName: 'FetchRelevantDocuments' })
        .invoke(state.question, config);

      this.loggerService.log(
        JSON.stringify({
          message: 'Documents retrieved successfully',
          service: 'SelfRagService',
          method: 'retrieve',
          documentCount: documents.length,
        }),
      );

      return {
        documents,
      };
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error retrieving documents',
          service: 'SelfRagService',
          method: 'retrieve',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          question: state.question,
        }),
      );

      // Return empty documents to allow the graph to continue
      return {
        documents: [],
      };
    }
  }

  /**
   * Generate an answer based on retrieved documents
   */
  async generate(
    state: typeof this.GraphState.State,
  ): Promise<Partial<typeof this.GraphState.State>> {
    this.loggerService.log(
      JSON.stringify({
        message: '---GENERATE---',
        service: 'SelfRagService',
        method: 'generate',
      }),
    );

    // Pull in the prompt
    const prompt = await pull<ChatPromptTemplate>('rlm/rag-prompt');
    // Construct the RAG chain by piping the prompt, model, and output parser
    const ragChain = prompt.pipe(this.llm).pipe(new StringOutputParser());

    const generation = await ragChain.invoke({
      context: formatDocumentsAsString(state.documents),
      question: state.question,
    });

    return {
      generation,
    };
  }

  /**
   * Determines whether the retrieved documents are relevant to the question.
   */
  async gradeDocuments(
    state: typeof this.GraphState.State,
  ): Promise<Partial<typeof this.GraphState.State>> {
    this.loggerService.log(
      JSON.stringify({
        message: '---CHECK RELEVANCE---',
        service: 'SelfRagService',
        method: 'gradeDocuments',
      }),
    );

    // pass the name & schema to `withStructuredOutput` which will force the model to call this tool.
    const llmWithTool = this.llm.withStructuredOutput(
      z
        .object({
          binaryScore: z
            .enum(['yes', 'no'])
            .describe("Relevance score 'yes' or 'no'"),
        })
        .describe(
          "Grade the relevance of the retrieved documents to the question. Either 'yes' or 'no'.",
        ),
      {
        name: 'grade',
      },
    );

    const prompt = ChatPromptTemplate.fromTemplate(
      `You are a grader assessing relevance of a retrieved document to a user question.
  Here is the retrieved document:

  {context}

  Here is the user question: {question}

  If the document contains keyword(s) or semantic meaning related to the user question, grade it as relevant.
  Give a binary score 'yes' or 'no' score to indicate whether the document is relevant to the question.`,
    );

    // Chain
    const chain = prompt.pipe(llmWithTool);

    const filteredDocs: Array<Document> = [];
    for await (const doc of state.documents) {
      const grade = await chain.invoke({
        context: doc.pageContent,
        question: state.question,
      });
      if (grade.binaryScore === 'yes') {
        this.loggerService.log(
          JSON.stringify({
            message: '---GRADE: DOCUMENT RELEVANT---',
            service: 'SelfRagService',
            method: 'gradeDocuments',
          }),
        );
        filteredDocs.push(doc);
      } else {
        this.loggerService.log(
          JSON.stringify({
            message: '---GRADE: DOCUMENT NOT RELEVANT---',
            service: 'SelfRagService',
            method: 'gradeDocuments',
          }),
        );
      }
    }

    return {
      documents: filteredDocs,
    };
  }

  /**
   * Transform the query to produce a better question.
   */
  async transformQuery(
    state: typeof this.GraphState.State,
  ): Promise<Partial<typeof this.GraphState.State>> {
    this.loggerService.log(
      JSON.stringify({
        message: '---TRANSFORM QUERY---',
        service: 'SelfRagService',
        method: 'transformQuery',
      }),
    );

    // Pull in the prompt
    const prompt = ChatPromptTemplate.fromTemplate(
      `You are generating a question that is well optimized for semantic search retrieval.
  Look at the input and try to reason about the underlying sematic intent / meaning.
  Here is the initial question:
  \n ------- \n
  {question} 
  \n ------- \n
  Formulate an improved question: `,
    );

    // Construct the chain
    const chain = prompt.pipe(this.llm).pipe(new StringOutputParser());
    const betterQuestion = await chain.invoke({ question: state.question });

    return {
      question: betterQuestion,
    };
  }

  /**
   * Determines whether the generation is grounded in the document.
   */
  async generateGenerationVDocumentsGrade(
    state: typeof this.GraphState.State,
  ): Promise<Partial<typeof this.GraphState.State>> {
    this.loggerService.log(
      JSON.stringify({
        message: '---GENERATE GENERATION vs DOCUMENTS GRADE---',
        service: 'SelfRagService',
        method: 'generateGenerationVDocumentsGrade',
      }),
    );

    const llmWithTool = this.llm.withStructuredOutput(
      z
        .object({
          binaryScore: z
            .enum(['yes', 'no'])
            .describe("Relevance score 'yes' or 'no'"),
        })
        .describe(
          "Grade the relevance of the retrieved documents to the question. Either 'yes' or 'no'.",
        ),
      {
        name: 'grade',
      },
    );

    const prompt = ChatPromptTemplate.fromTemplate(
      `You are a grader assessing whether an answer is grounded in / supported by a set of facts.
  Here are the facts:
  \n ------- \n
  {documents} 
  \n ------- \n
  Here is the answer: {generation}
  Give a binary score 'yes' or 'no' to indicate whether the answer is grounded in / supported by a set of facts.`,
    );

    const chain = prompt.pipe(llmWithTool);

    const score = await chain.invoke({
      documents: formatDocumentsAsString(state.documents),
      generation: state.generation,
    });

    return {
      generationVDocumentsGrade: score.binaryScore,
    };
  }

  /**
   * Determines whether the generation addresses the question.
   */
  async generateGenerationVQuestionGrade(
    state: typeof this.GraphState.State,
  ): Promise<Partial<typeof this.GraphState.State>> {
    this.loggerService.log(
      JSON.stringify({
        message: '---GENERATE GENERATION vs QUESTION GRADE---',
        service: 'SelfRagService',
        method: 'generateGenerationVQuestionGrade',
      }),
    );

    const llmWithTool = this.llm.withStructuredOutput(
      z
        .object({
          binaryScore: z
            .enum(['yes', 'no'])
            .describe("Relevance score 'yes' or 'no'"),
        })
        .describe(
          "Grade the relevance of the retrieved documents to the question. Either 'yes' or 'no'.",
        ),
      {
        name: 'grade',
      },
    );

    const prompt = ChatPromptTemplate.fromTemplate(
      `You are a grader assessing whether an answer is useful to resolve a question.
  Here is the answer:
  \n ------- \n
  {generation} 
  \n ------- \n
  Here is the question: {question}
  Give a binary score 'yes' or 'no' to indicate whether the answer is useful to resolve a question.`,
    );

    const chain = prompt.pipe(llmWithTool);

    const score = await chain.invoke({
      question: state.question,
      generation: state.generation,
    });

    return {
      generationVQuestionGrade: score.binaryScore,
    };
  }

  // ************ Edge Functions ************

  /**
   * Determines whether to generate an answer, or re-generate a question.
   */
  decideToGenerate(state: typeof this.GraphState.State) {
    this.loggerService.log(
      JSON.stringify({
        message: '---DECIDE TO GENERATE---',
        service: 'SelfRagService',
        method: 'decideToGenerate',
      }),
    );

    const filteredDocs = state.documents;
    if (filteredDocs.length === 0) {
      // All documents have been filtered checkRelevance
      // We will re-generate a new query
      this.loggerService.log(
        JSON.stringify({
          message: '---DECISION: TRANSFORM QUERY---',
          service: 'SelfRagService',
          method: 'decideToGenerate',
        }),
      );
      return 'transformQuery';
    }

    // We have relevant documents, so generate answer
    this.loggerService.log(
      JSON.stringify({
        message: '---DECISION: GENERATE---',
        service: 'SelfRagService',
        method: 'decideToGenerate',
      }),
    );
    return 'generate';
  }

  /**
   * Evaluates if the generation is supported by the documents
   */
  gradeGenerationVDocuments(state: typeof this.GraphState.State) {
    this.loggerService.log(
      JSON.stringify({
        message: '---GRADE GENERATION vs DOCUMENTS---',
        service: 'SelfRagService',
        method: 'gradeGenerationVDocuments',
      }),
    );

    const grade = state.generationVDocumentsGrade;
    if (grade === 'yes') {
      this.loggerService.log(
        JSON.stringify({
          message: '---DECISION: SUPPORTED, MOVE TO FINAL GRADE---',
          service: 'SelfRagService',
          method: 'gradeGenerationVDocuments',
        }),
      );
      return 'supported';
    }

    this.loggerService.log(
      JSON.stringify({
        message: '---DECISION: NOT SUPPORTED, GENERATE AGAIN---',
        service: 'SelfRagService',
        method: 'gradeGenerationVDocuments',
      }),
    );
    return 'not supported';
  }

  /**
   * Evaluates if the generation addresses the question
   */
  gradeGenerationVQuestion(state: typeof this.GraphState.State) {
    this.loggerService.log(
      JSON.stringify({
        message: '---GRADE GENERATION vs QUESTION---',
        service: 'SelfRagService',
        method: 'gradeGenerationVQuestion',
      }),
    );

    const grade = state.generationVQuestionGrade;
    if (grade === 'yes') {
      this.loggerService.log(
        JSON.stringify({
          message: '---DECISION: USEFUL---',
          service: 'SelfRagService',
          method: 'gradeGenerationVQuestion',
        }),
      );
      return 'useful';
    }

    this.loggerService.log(
      JSON.stringify({
        message: '---DECISION: NOT USEFUL---',
        service: 'SelfRagService',
        method: 'gradeGenerationVQuestion',
      }),
    );
    return 'not useful';
  }

  // ************ Graph Construction ************

  async getGraph() {
    try {
      const workflow = new StateGraph(this.GraphState)
        // Define the nodes
        .addNode('retrieve', this.retrieve.bind(this))
        .addNode('gradeDocuments', this.gradeDocuments.bind(this))
        .addNode('generate', this.generate.bind(this))
        .addNode(
          'generateGenerationVDocumentsGrade',
          this.generateGenerationVDocumentsGrade.bind(this),
        )
        .addNode('transformQuery', this.transformQuery.bind(this))
        .addNode(
          'generateGenerationVQuestionGrade',
          this.generateGenerationVQuestionGrade.bind(this),
        );

      // Build graph
      workflow.addEdge(START, 'retrieve');
      workflow.addEdge('retrieve', 'gradeDocuments');
      workflow.addConditionalEdges(
        'gradeDocuments',
        this.decideToGenerate.bind(this),
        {
          transformQuery: 'transformQuery',
          generate: 'generate',
        },
      );
      workflow.addEdge('transformQuery', 'retrieve');
      workflow.addEdge('generate', 'generateGenerationVDocumentsGrade');
      workflow.addConditionalEdges(
        'generateGenerationVDocumentsGrade',
        this.gradeGenerationVDocuments.bind(this),
        {
          supported: 'generateGenerationVQuestionGrade',
          'not supported': 'generate',
        },
      );

      workflow.addConditionalEdges(
        'generateGenerationVQuestionGrade',
        this.gradeGenerationVQuestion.bind(this),
        {
          useful: END,
          'not useful': 'transformQuery',
        },
      );

      // Compile
      const memory = new MemorySaver();
      return workflow.compile({ checkpointer: memory });
    } catch (error) {
      this.loggerService.error(
        JSON.stringify({
          message: 'Error building Self-RAG graph',
          service: 'SelfRagService',
          method: 'getGraph',
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      throw error;
    }
  }

  /**
   * Ask the Self-RAG agent a question
   */
  async askAgent(question: string, threadId: string = 'default') {
    try {
      this.loggerService.log(
        JSON.stringify({
          message: 'Starting Self-RAG query',
          service: 'SelfRagService',
          method: 'askAgent',
          question,
          threadId,
        }),
      );

      // Only answer questions related to audit data
      const auditDataFilter = await this.llm.invoke([
        new SystemMessage(
          `You are an audit data assistant. You should determine if the user's question is related to audit data.
          If the question is about audit data, respond with "RELEVANT".
          If the question is not about audit data, respond with "NOT RELEVANT".
          Only respond with one of these two options.`,
        ),
        new HumanMessage(question),
      ]);

      // Fix: Convert complex content to string before checking
      const filterContent =
        typeof auditDataFilter.content === 'string'
          ? auditDataFilter.content
          : JSON.stringify(auditDataFilter.content);

      if (filterContent.includes('NOT RELEVANT')) {
        this.loggerService.log(
          JSON.stringify({
            message: 'Question not relevant to audit data',
            service: 'SelfRagService',
            method: 'askAgent',
            question,
          }),
        );
        return "I'm sorry, I can only answer questions related to audit data.";
      }

      const response = await this.app.invoke(
        {
          question,
          documents: [],
          generation: '',
          generationVQuestionGrade: '',
          generationVDocumentsGrade: '',
        },
        {
          configurable: {
            thread_id: threadId,
          },
          recursionLimit: 50,
        },
      );

      this.loggerService.log(
        JSON.stringify({
          message: 'Self-RAG query completed successfully',
          service: 'SelfRagService',
          method: 'askAgent',
          responseLength: response.generation.length,
        }),
      );

      return response.generation;
    } catch (error) {
      console.log({ error });
      this.loggerService.error(
        JSON.stringify({
          message: 'Error asking Self-RAG agent',
          service: 'SelfRagService',
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
