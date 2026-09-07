import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StateEngine } from "../core/engine.js";
import { StateMCPConfig } from "../core/types.js";

/**
 * Creates and configures the official MCP server instance
 * connected to the StateEngine.
 */
export function createMcpProtocolServer(
  engine: StateEngine<any>,
  config: StateMCPConfig<any>
): Server {
  const server = new Server(
    {
      name: config.name,
      version: config.version || "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true, // Signals dynamic tool updates to AI clients
        },
        resources: {
          listChanged: true,
        },
      },
    }
  );

  // 1. Dynamic Tool Listing (Advertises only current affordances)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const active = engine.getActiveTools();
    const currentState = engine.getSession().currentState;

    return {
      tools: active.map((tool) => ({
        name: tool.name,
        description: `[State: ${currentState}] ${tool.description}`,
        inputSchema: tool.inputSchema || { type: "object", properties: {} },
      })),
    };
  });

  // 2. State-Guarded Tool Invocation
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const execution = await engine.executeTool(name, args || {});

    if (!execution.success) {
      return {
        content: [
          {
            type: "text",
            text: `❌ [StateMCP Error]: ${execution.error}\n\n${execution.stateSummary}`,
          },
        ],
        isError: true,
      };
    }

    const decorate = config.decorateToolOutput !== false;
    let outputText = "";

    if (decorate) {
      outputText =
        `-----------------------------------------\n` +
        `📍 STATE CONTEXT: ${execution.currentState}\n` +
        (execution.previousState && execution.previousState !== execution.currentState
          ? `🔄 TRANSITION: ${execution.previousState} ➔ ${execution.currentState}\n`
          : "") +
        `-----------------------------------------\n\n` +
        JSON.stringify(execution.data, null, 2);
    } else {
      outputText = JSON.stringify(execution.data, null, 2);
    }

    return {
      content: [
        {
          type: "text",
          text: outputText,
        },
      ],
    };
  });

  // 3. MCP Resources: State Inspection & Agent Memory
  if (config.enableBuiltinResources !== false) {
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "state://current",
            name: "Current State & Agent Memory",
            description:
              "Active state name, description, saved state variables, and agent scratchpad notes.",
            mimeType: "application/json",
          },
          {
            uri: "state://transitions",
            name: "Allowed State Transitions",
            description: "List of states the agent can legally navigate to from the current state.",
            mimeType: "application/json",
          },
          {
            uri: "state://history",
            name: "State Trajectory History",
            description: "Chronological audit trail of all previous states and snapshots.",
            mimeType: "application/json",
          },
        ],
      };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const session = engine.getSession();
      const currentDef = engine.getState(session.currentState);
      const memory = engine.getMemory();

      if (uri === "state://current") {
        const payload = {
          currentState: session.currentState,
          description: currentDef?.description || "",
          savedStateInfo: memory.getInfo(),
          agentNotes: memory.getAgentNotes(),
          allowedTransitions: currentDef?.allowedTransitions || [],
          updatedAt: new Date(session.updatedAt).toISOString(),
        };
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      }

      if (uri === "state://transitions") {
        const payload = {
          fromState: session.currentState,
          allowedTargetStates: currentDef?.allowedTransitions || [],
          allRegisteredStates: engine.getAllStates().map((s) => ({
            name: s.name,
            allowedTransitions: s.allowedTransitions,
          })),
        };
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(payload, null, 2),
            },
          ],
        };
      }

      if (uri === "state://history") {
        const history = memory.getHistory();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(history, null, 2),
            },
          ],
        };
      }

      throw new Error(`Resource with URI '${uri}' not found.`);
    });
  }

  // 4. Fire MCP notifications on state transitions
  engine.onStateChange((session, prev, next) => {
    server
      .notification({
        method: "notifications/tools/list_changed",
      })
      .catch(() => {});

    server
      .notification({
        method: "notifications/resources/list_changed",
      })
      .catch(() => {});
  });

  return server;
}
