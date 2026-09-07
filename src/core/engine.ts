import {
  StateDefinition,
  ToolDefinition,
  SessionState,
  ToolExecutionContext,
} from "./types.js";
import { StateMemoryManager } from "./memory.js";

export type StateListener<TContext = any> = (
  session: SessionState<TContext>,
  previousState: string,
  newState: string
) => void;

export class StateEngine<TContext = Record<string, any>> {
  private states: Map<string, StateDefinition<TContext>> = new Map();
  private tools: Map<string, ToolDefinition<TContext>> = new Map();
  private session: SessionState<TContext>;
  private memory: StateMemoryManager;
  private listeners: StateListener<TContext>[] = [];

  constructor(
    initialState: string,
    initialContext: TContext,
    sessionId: string = "default-session"
  ) {
    this.session = {
      id: sessionId,
      currentState: initialState,
      context: initialContext,
      updatedAt: Date.now(),
    };
    this.memory = new StateMemoryManager();
    this.memory.recordSnapshot(initialState);
  }

  public getMemory(): StateMemoryManager {
    return this.memory;
  }

  public registerState(def: StateDefinition<TContext>): this {
    this.states.set(def.name, def);
    return this;
  }

  public registerTool(def: ToolDefinition<TContext>): this {
    this.tools.set(def.name, def);
    return this;
  }

  public getState(name: string): StateDefinition<TContext> | undefined {
    return this.states.get(name);
  }

  public getAllStates(): StateDefinition<TContext>[] {
    return Array.from(this.states.values());
  }

  public getAllTools(): ToolDefinition<TContext>[] {
    return Array.from(this.tools.values());
  }

  public getSession(): SessionState<TContext> {
    return {
      ...this.session,
      context: { ...this.session.context },
    };
  }

  public onStateChange(listener: StateListener<TContext>): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Returns only tools that are active and advertised in the current state.
   */
  public getActiveTools(): ToolDefinition<TContext>[] {
    const currentState = this.session.currentState;
    return Array.from(this.tools.values()).filter((tool) => {
      const isAllowedState =
        tool.states.includes("*") || tool.states.includes(currentState);

      if (!isAllowedState) return false;

      if (tool.canExecute) {
        const check = tool.canExecute(
          this.session.context,
          this.memory.getInfo()
        );
        return typeof check === "boolean" ? check : check.allowed;
      }

      return true;
    });
  }

  /**
   * Transition session to a target state with transition validation
   */
  public transition(targetState: string, contextUpdates?: Partial<TContext>): void {
    const currentState = this.session.currentState;
    if (currentState === targetState && !contextUpdates) return;

    const currentDef = this.states.get(currentState);
    if (currentDef && !currentDef.allowedTransitions.includes(targetState)) {
      throw new Error(
        `[StateMCP Guardrail] Cannot transition from '${currentState}' to '${targetState}'. ` +
          `Allowed target states: [${currentDef.allowedTransitions.join(", ")}].`
      );
    }

    const prev = currentState;
    this.session.previousState = prev;
    this.session.currentState = targetState;
    if (contextUpdates) {
      this.session.context = {
        ...this.session.context,
        ...contextUpdates,
      };
    }
    this.session.updatedAt = Date.now();

    // Record memory snapshot
    this.memory.recordSnapshot(targetState);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(this.session, prev, targetState);
      } catch (err) {
        console.error("[StateEngine] Listener error:", err);
      }
    }
  }

  /**
   * Execute a tool by name with full state guardrails and helper context
   */
  public async executeTool(
    name: string,
    args: any = {}
  ): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    previousState?: string;
    currentState: string;
    stateSummary: string;
  }> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${name}' is not registered on this StateMCP server.`,
        currentState: this.session.currentState,
        stateSummary: this.getStateSummary(),
      };
    }

    const currentState = this.session.currentState;
    const isAllowedInState =
      tool.states.includes("*") || tool.states.includes(currentState);

    if (!isAllowedInState) {
      const activeToolNames = this.getActiveTools().map((t) => t.name);
      return {
        success: false,
        error:
          `[State Violation] Tool '${name}' is NOT available in state '${currentState}'. ` +
          `Valid states for this tool: [${tool.states.join(", ")}]. ` +
          `Currently available tools on this screen: [${activeToolNames.join(", ")}].`,
        currentState: this.session.currentState,
        stateSummary: this.getStateSummary(),
      };
    }

    // Precondition verification
    if (tool.canExecute) {
      const check = tool.canExecute(this.session.context, this.memory.getInfo());
      const isAllowed = typeof check === "boolean" ? check : check.allowed;
      if (!isAllowed) {
        const reason =
          typeof check === "object" && check.reason
            ? check.reason
            : "Precondition check rejected.";
        return {
          success: false,
          error: `[Precondition Failed for '${name}'] ${reason}`,
          currentState: this.session.currentState,
          stateSummary: this.getStateSummary(),
        };
      }
    }

    // Prepare execution context helpers
    let targetState: string | undefined;
    let pendingContextUpdates: Partial<TContext> = {};

    const helpers: ToolExecutionContext<TContext> = {
      context: Object.freeze({ ...this.session.context }),
      session: Object.freeze({ ...this.session }),
      transition: (to: string, contextUpdates?: Partial<TContext>) => {
        targetState = to;
        if (contextUpdates) {
          pendingContextUpdates = { ...pendingContextUpdates, ...contextUpdates };
        }
      },
      updateContext: (updates: Partial<TContext>) => {
        pendingContextUpdates = { ...pendingContextUpdates, ...updates };
      },
      saveStateInfo: (k: string, v: any) => {
        this.memory.saveInfo(k, v);
      },
      saveAgentNote: (note: string) => {
        this.memory.addAgentNote(note);
      },
      getStateInfo: (k?: string) => {
        return this.memory.getInfo(k);
      },
    };

    try {
      const result = await tool.execute(args, helpers);

      // Apply context updates
      if (Object.keys(pendingContextUpdates).length > 0) {
        this.session.context = {
          ...this.session.context,
          ...pendingContextUpdates,
        };
      }

      const prev = currentState;
      if (targetState && targetState !== currentState) {
        this.transition(targetState);
      }

      return {
        success: true,
        data: result,
        previousState: prev,
        currentState: this.session.currentState,
        stateSummary: this.getStateSummary(),
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Unknown error during tool execution.",
        currentState: this.session.currentState,
        stateSummary: this.getStateSummary(),
      };
    }
  }

  /**
   * Reset session back to starting state and optionally clear all memory
   */
  public reset(
    initialState: string,
    initialContext: TContext,
    clearMemory: boolean = true
  ): void {
    const prev = this.session.currentState;
    this.session.currentState = initialState;
    this.session.previousState = prev;
    this.session.context = initialContext;
    this.session.updatedAt = Date.now();

    if (clearMemory) {
      this.memory.clear();
      this.memory.recordSnapshot(initialState);
    }

    for (const listener of this.listeners) {
      listener(this.session, prev, initialState);
    }
  }

  public getStateSummary(): string {
    const currentDef = this.states.get(this.session.currentState);
    return this.memory.formatStateSummaryCard(
      this.session.currentState,
      currentDef,
      this.session.context
    );
  }
}
