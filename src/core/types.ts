import { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Configuration options for creating a StateMCP server instance
 */
export interface StateMCPConfig<TContext = Record<string, any>> {
  /**
   * Product / Server name (e.g. 'linear-mcp', 'acme-crm')
   */
  name: string;

  /**
   * Version string
   */
  version?: string;

  /**
   * The starting state of the session (e.g. 'HOME', 'DASHBOARD')
   */
  initialState: string;

  /**
   * Initial context data for the session
   */
  initialContext?: TContext;

  /**
   * Unique session ID (defaults to 'default-session')
   */
  sessionId?: string;

  /**
   * Whether to inject built-in agent memory & state inspection tools.
   * Default: true
   */
  enableBuiltinTools?: boolean;

  /**
   * Whether to expose MCP Resources for state inspection ('state://current', 'state://transitions').
   * Default: true
   */
  enableBuiltinResources?: boolean;

  /**
   * Whether to automatically decorate tool output with a header summarizing current state and memory.
   * Default: true
   */
  decorateToolOutput?: boolean;
}

/**
 * Definition of a State within the product workflow
 */
export interface StateDefinition<TContext = Record<string, any>> {
  /**
   * Unique state name (e.g. 'SEARCH_RESULTS', 'CART', 'ISSUE_DETAIL')
   */
  name: string;

  /**
   * Human- and LLM-readable description of what this state represents
   */
  description: string;

  /**
   * List of state names that can be transitioned to from this state
   */
  allowedTransitions: string[];

  /**
   * Optional function to generate a rich state summary for the LLM
   */
  stateSummary?: (context: TContext, memory: Record<string, any>) => string;

  /**
   * Optional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Context provided to a tool's execute function
 */
export interface ToolExecutionContext<TContext = Record<string, any>> {
  /**
   * The current context object
   */
  context: Readonly<TContext>;

  /**
   * Transition to a new valid state, optionally updating context
   */
  transition: (targetState: string, contextUpdates?: Partial<TContext>) => void;

  /**
   * Update the session context without transitioning state
   */
  updateContext: (updates: Partial<TContext>) => void;

  /**
   * Save a key-value piece of state information that persists across transitions
   * and is visible to the agent via state summaries and MCP resources
   */
  saveStateInfo: (key: string, value: any) => void;

  /**
   * Add a note to the agent scratchpad memory
   */
  saveAgentNote: (note: string) => void;

  /**
   * Retrieve saved state information
   */
  getStateInfo: (key?: string) => any;

  /**
   * The current session info
   */
  session: Readonly<SessionState<TContext>>;

  /**
   * Optional AbortSignal from the client if the request is cancelled
   */
  signal?: AbortSignal;
}

/**
 * Execution result returned by a tool
 */
export interface ToolExecutionResult<TContext = Record<string, any>> {
  result: any;
  nextState?: string;
  updatedContext?: Partial<TContext>;
  stateInfo?: Record<string, any>;
  message?: string;
}

/**
 * Tool annotations per Anthropic MCP specification
 */
export interface ToolAnnotations {
  /**
   * Hint that this tool does not modify environment or state
   */
  readOnlyHint?: boolean;

  /**
   * Hint that this tool performs irreversible or destructive changes
   */
  destructiveHint?: boolean;

  /**
   * Hint that this tool accesses the open internet or external systems
   */
  openWorldHint?: boolean;
}

/**
 * Definition of a Dynamic Tool registered in StateMCP
 */
export interface ToolDefinition<TContext = Record<string, any>, TArgs = any> {
  /**
   * Tool name (must be unique)
   */
  name: string;

  /**
   * Human-friendly display title (per Anthropic MCP spec)
   */
  title?: string;

  /**
   * Description explaining what the tool accomplishes
   */
  description: string;

  /**
   * States in which this tool is active.
   * Use ['*'] to make it available in all states.
   */
  states: string[];

  /**
   * Input schema definition: supports either a native Zod schema (z.object({...}))
   * or a standard JSON Schema object.
   */
  schema?: any;

  /**
   * Backward-compatible alias for JSON Schema definitions
   */
  inputSchema?: {
    type?: "object";
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };

  /**
   * Annotations for model reasoning hints (read-only, destructive, open-world)
   */
  annotations?: ToolAnnotations;

  /**
   * Optional precondition check. If false or { allowed: false }, the tool call is rejected
   * before execution.
   */
  canExecute?: (
    context: TContext,
    stateInfo: Record<string, any>
  ) => boolean | { allowed: boolean; reason?: string };

  /**
   * The implementation function
   */
  execute: (args: TArgs, helpers: ToolExecutionContext<TContext>) => Promise<any> | any;
}

/**
 * Represents the active session state
 */
export interface SessionState<TContext = Record<string, any>> {
  id: string;
  currentState: string;
  previousState?: string;
  context: TContext;
  updatedAt: number;
}

/**
 * Snapshot of state memory at a point in time
 */
export interface StateMemorySnapshot {
  timestamp: number;
  state: string;
  info: Record<string, any>;
  notes: string[];
}
