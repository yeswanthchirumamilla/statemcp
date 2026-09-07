import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StateEngine } from "./engine.js";
import { createMcpProtocolServer } from "../mcp/protocol-server.js";
import {
  StateMCPConfig,
  StateDefinition,
  ToolDefinition,
  SessionState,
} from "./types.js";

/**
 * StateMCP is the developer-facing SDK class used to define states,
 * dynamic tools, and publish any product as a state-aware MCP server.
 */
export class StateMCP<TContext = Record<string, any>> {
  private config: StateMCPConfig<TContext>;
  private engine: StateEngine<TContext>;
  private mcpServer: Server;

  constructor(config: StateMCPConfig<TContext>) {
    this.config = {
      version: "1.0.0",
      enableBuiltinTools: true,
      enableBuiltinResources: true,
      decorateToolOutput: true,
      ...config,
    };

    this.engine = new StateEngine<TContext>(
      this.config.initialState,
      (this.config.initialContext || {}) as TContext,
      this.config.sessionId || "default-session"
    );

    // Register built-in agent memory & state introspection tools
    if (this.config.enableBuiltinTools !== false) {
      this.registerBuiltinTools();
    }

    // Initialize the official MCP server
    this.mcpServer = createMcpProtocolServer(this.engine, this.config);
  }

  /**
   * Define a workflow state with its allowed transitions and description
   */
  public defineState(
    name: string,
    definition: Omit<StateDefinition<TContext>, "name">
  ): this {
    this.engine.registerState({
      name,
      ...definition,
    });
    return this;
  }

  /**
   * Register a tool that is dynamically available in specific states
   */
  public registerTool<TArgs = any>(
    tool: ToolDefinition<TContext, TArgs>
  ): this {
    this.engine.registerTool(tool as ToolDefinition<TContext>);
    return this;
  }

  /**
   * Save a key-value piece of state information directly from backend code
   */
  public saveStateInfo(key: string, value: any): this {
    this.engine.getMemory().saveInfo(key, value);
    return this;
  }

  /**
   * Get the current session state and context
   */
  public getSession(): SessionState<TContext> {
    return this.engine.getSession();
  }

  /**
   * Access the underlying StateEngine instance
   */
  public getEngine(): StateEngine<TContext> {
    return this.engine;
  }

  /**
   * Access the underlying @modelcontextprotocol/sdk Server instance
   */
  public getMcpServer(): Server {
    return this.mcpServer;
  }

  /**
   * Start the MCP server using Standard I/O (Stdio).
   * This is the standard transport used by Claude Desktop, Cursor, and Antigravity IDE.
   */
  public async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
    console.error(
      `[StateMCP] ${this.config.name} v${this.config.version} started on stdio transport.`
    );
  }

  /**
   * Register built-in agent memory and state inspection tools
   */
  private registerBuiltinTools(): void {
    // 1. inspect_state_context: Lets the agent understand its current location and memory
    this.engine.registerTool({
      name: "inspect_state_context",
      description:
        "Inspect current workflow state, allowed transitions, saved state info, and agent scratchpad memory.",
      states: ["*"], // Available everywhere
      inputSchema: {
        type: "object",
        properties: {},
      },
      execute: async (_, { session, getStateInfo }) => {
        const currentDef = this.engine.getState(session.currentState);
        const memory = this.engine.getMemory();

        return {
          currentState: session.currentState,
          description: currentDef?.description || "",
          allowedTransitions: currentDef?.allowedTransitions || [],
          savedStateInfo: memory.getInfo(),
          agentNotes: memory.getAgentNotes(),
          activeTools: this.engine.getActiveTools().map((t) => t.name),
        };
      },
    });

    // 2. save_agent_note: Lets the agent persist working memory / scratchpad
    this.engine.registerTool({
      name: "save_agent_note",
      description:
        "Save a working note or observation into the session state memory for future reasoning.",
      states: ["*"],
      inputSchema: {
        type: "object",
        properties: {
          note: {
            type: "string",
            description: "Observation or reasoning note to remember across state transitions.",
          },
        },
        required: ["note"],
      },
      execute: async (args: { note: string }, { saveAgentNote }) => {
        saveAgentNote(args.note);
        return {
          message: "Note saved to agent memory scratchpad.",
          savedNote: args.note,
        };
      },
    });

    // 3. save_state_info: Lets the agent or tool store structured state metadata
    this.engine.registerTool({
      name: "save_state_info",
      description: "Save a structured key-value property into the persistent state memory.",
      states: ["*"],
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Metadata key name" },
          value: { description: "Any JSON-serializable value" },
        },
        required: ["key", "value"],
      },
      execute: async (args: { key: string; value: any }, { saveStateInfo }) => {
        saveStateInfo(args.key, args.value);
        return {
          message: `Saved state info key '${args.key}'.`,
          key: args.key,
          value: args.value,
        };
      },
    });

    // 4. reset_session: Clears all saved context and restarts at the initial state
    this.engine.registerTool({
      name: "reset_session",
      description: "Reset the session back to the initial state and clear all state memory.",
      states: ["*"],
      inputSchema: {
        type: "object",
        properties: {
          clearMemory: {
            type: "boolean",
            default: true,
            description: "Whether to clear all saved state information and notes.",
          },
        },
      },
      execute: async (args: { clearMemory?: boolean }) => {
        this.engine.reset(
          this.config.initialState,
          (this.config.initialContext || {}) as TContext,
          args.clearMemory !== false
        );
        return {
          message: `Session reset to '${this.config.initialState}'.`,
          currentState: this.config.initialState,
        };
      },
    });
  }
}
