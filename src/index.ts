/**
 * StateMCP: The State-Aware Dynamic Model Context Protocol (MCP) SDK
 * 
 * Allows product teams and developers to expose their products as dynamic,
 * state-gated MCP servers with built-in agent memory and context persistence.
 */

export { StateMCP } from "./core/state-mcp.js";
export { StateEngine } from "./core/engine.js";
export { StateMemoryManager } from "./core/memory.js";
export { createMcpProtocolServer } from "./mcp/protocol-server.js";

export type {
  StateMCPConfig,
  StateDefinition,
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  SessionState,
  StateMemorySnapshot,
} from "./core/types.js";
