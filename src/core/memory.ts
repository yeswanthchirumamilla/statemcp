import { StateDefinition, StateMemorySnapshot } from "./types.js";

/**
 * Manages state information, agent scratchpad notes, checkpoints,
 * and memory snapshots across the session lifecycle.
 */
export class StateMemoryManager {
  private stateInfo: Map<string, any> = new Map();
  private agentNotes: string[] = [];
  private history: StateMemorySnapshot[] = [];

  constructor(initialInfo?: Record<string, any>) {
    if (initialInfo) {
      for (const [k, v] of Object.entries(initialInfo)) {
        this.stateInfo.set(k, v);
      }
    }
  }

  /**
   * Save a key-value piece of state information that persists across transitions
   */
  public saveInfo(key: string, value: any): void {
    this.stateInfo.set(key, value);
  }

  /**
   * Retrieve saved state information by key, or all saved information if key is omitted
   */
  public getInfo(key?: string): any {
    if (key) {
      return this.stateInfo.get(key);
    }
    const result: Record<string, any> = {};
    for (const [k, v] of this.stateInfo.entries()) {
      result[k] = v;
    }
    return result;
  }

  /**
   * Delete a key from state information
   */
  public deleteInfo(key: string): boolean {
    return this.stateInfo.delete(key);
  }

  /**
   * Add a note or observation to the agent's scratchpad memory
   */
  public addAgentNote(note: string): void {
    const formatted = `[${new Date().toLocaleTimeString()}] ${note}`;
    this.agentNotes.push(formatted);
  }

  /**
   * Retrieve all saved agent notes
   */
  public getAgentNotes(): string[] {
    return [...this.agentNotes];
  }

  /**
   * Record a snapshot of the current state and memory
   */
  public recordSnapshot(state: string): void {
    this.history.push({
      timestamp: Date.now(),
      state,
      info: this.getInfo(),
      notes: [...this.agentNotes],
    });
  }

  /**
   * Get the full trajectory history
   */
  public getHistory(): StateMemorySnapshot[] {
    return [...this.history];
  }

  /**
   * Clear all saved memory and scratchpad notes
   */
  public clear(): void {
    this.stateInfo.clear();
    this.agentNotes = [];
    this.history = [];
  }

  /**
   * Generate an intelligent markdown state summary card for the LLM
   */
  public formatStateSummaryCard(
    currentState: string,
    stateDef?: StateDefinition<any>,
    context?: any
  ): string {
    const info = this.getInfo();
    const infoKeys = Object.keys(info);

    let summary = `📍 CURRENT STATE: ${currentState}\n`;
    if (stateDef) {
      summary += `📝 Description: ${stateDef.description}\n`;
      summary += `➡️ Valid Next States: [${stateDef.allowedTransitions.join(", ")}]\n`;
    }

    if (infoKeys.length > 0) {
      summary += `\n💾 Saved State Info:\n`;
      for (const [k, v] of Object.entries(info)) {
        summary += `  • ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}\n`;
      }
    }

    if (this.agentNotes.length > 0) {
      summary += `\n🧠 Agent Working Notes:\n`;
      for (const note of this.agentNotes.slice(-5)) {
        summary += `  • ${note}\n`;
      }
    }

    return summary.trim();
  }
}
