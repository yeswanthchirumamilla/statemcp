# StatefulMCP SDK (`stateful-mcp-sdk`)

> **The State-Aware Dynamic Model Context Protocol (MCP) SDK**  
> Expose any product, web app, or SaaS backend as a dynamic, stateful MCP server with built-in agent memory and context persistence.

[![npm version](https://img.shields.io/badge/npm-v1.0.0-blue.svg)](https://www.npmjs.com/package/stateful-mcp-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-ES2022-blue)](https://www.typescriptlang.org/)

---

## The Problem: Why Static MCP Breaks for Real Products

Traditional MCP servers register all tools statically up front. If your product has 50 actions, all 50 tools are dumped into the LLM's system prompt on every turn. This leads to:

1. **Context Window Exhaustion**: Thousands of tokens wasted on irrelevant tools.
2. **Out-of-Order Hallucinations**: An AI agent tries to call `charge_payment` before `search_items` or `add_to_cart`.
3. **Zero State Awareness**: The model has no idea which "page", screen, or workflow stage the user is actually on.

## The Solution: StateMCP

**StateMCP** turns your product into a **Finite State Machine (FSM) for AI Agents**:
* **Dynamic Tool Gating**: The agent only sees the 2–4 tools valid for the active state.
* **Live Notifications**: When state transitions, StateMCP fires `notifications/tools/list_changed` per the official MCP spec.
* **Persistent Agent Memory**: Models can save state information (`saveStateInfo`) and scratchpad notes (`saveAgentNote`) that persist across transitions.
* **MCP Resources**: Exposes `state://current` and `state://transitions` so any LLM (Claude, Gemini, Cursor) instantly understands where it is in the product workflow.
* **Zero-Leak Guardrails**: Out-of-state tool execution is rejected at the protocol layer before touching your database.

---

## Installation

```bash
npm install stateful-mcp-sdk @modelcontextprotocol/sdk
```

---

## Quickstart: Exposing Your Product in 4 Steps

```typescript
import { StateMCP } from "stateful-mcp-sdk";

// 1. Initialize StateMCP for your product
const app = new StateMCP({
  name: "acme-store-mcp",
  version: "1.0.0",
  initialState: "STOREFRONT",
  initialContext: { cart: [] },
});

// 2. Define workflow states and valid transitions
app
  .defineState("STOREFRONT", {
    description: "Browsing products and catalog search.",
    allowedTransitions: ["PRODUCT_VIEW"],
  })
  .defineState("PRODUCT_VIEW", {
    description: "Inspecting single product details.",
    allowedTransitions: ["STOREFRONT", "CHECKOUT"],
  })
  .defineState("CHECKOUT", {
    description: "Payment and shipping address entry.",
    allowedTransitions: ["STOREFRONT"],
  });

// 3. Register state-gated tools with state memory
app.registerTool({
  name: "open_product",
  description: "View product specifications and pricing",
  states: ["STOREFRONT"], // Only visible when in STOREFRONT!
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string" },
    },
    required: ["productId"],
  },
  execute: async ({ productId }, { transition, saveStateInfo, saveAgentNote }) => {
    // Save state information for the agent
    saveStateInfo("viewed_product_id", productId);
    saveAgentNote(`User showed interest in ${productId}`);

    // Transition to the next valid state
    transition("PRODUCT_VIEW");

    return { title: "Noise Cancelling Headphones", price: 299 };
  },
});

app.registerTool({
  name: "complete_purchase",
  description: "Submit payment and order",
  states: ["CHECKOUT"], // Only visible when in CHECKOUT!
  execute: async (_, { transition, getStateInfo }) => {
    const productId = getStateInfo("viewed_product_id");
    transition("STOREFRONT");
    return { status: "PAID", orderId: "ORD-9912", item: productId };
  },
});

// 4. Start as an MCP server on Stdio (Claude Desktop, Cursor, Antigravity)
await app.startStdio();
```

---

## How Agents Understand State & Memory

### 1. Automatic State Context Decoration
When any tool executes, StateMCP automatically wraps the output with a state context banner:

```text
-----------------------------------------
📍 STATE CONTEXT: PRODUCT_VIEW
🔄 TRANSITION: STOREFRONT ➔ PRODUCT_VIEW
-----------------------------------------

{
  "title": "Noise Cancelling Headphones",
  "price": 299
}
```

### 2. Built-in Agent Tools
StateMCP automatically provides built-in affordances for the model:
* `inspect_state_context`: Returns current state, allowed transitions, saved state info, and active variables.
* `save_agent_note`: Lets the agent store working observations in scratchpad memory across transitions.
* `save_state_info`: Saves arbitrary structured key-value metadata to session memory.
* `reset_session`: Resets session back to the initial state and clears all memory.

### 3. MCP Resources (`resources/read`)
Connected AI agents can inspect state at any time via standard MCP resources:
* **`state://current`**: JSON document containing active state, description, saved state variables, and notes.
* **`state://transitions`**: List of valid target states and reachable workflow routes.
* **`state://history`**: Chronological audit log of state snapshots.

---

## Connecting to AI Clients

### Claude Desktop
Add your StateMCP server to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-product": {
      "command": "node",
      "args": ["/path/to/my-product/dist/index.js"]
    }
  }
}
```

### Cursor & Antigravity IDE
Point the MCP configuration to the compiled entry point or `npx tsx src/index.ts`.

---

## API Reference

### `new StateMCP(config)`
* `name`: Product / server name.
* `initialState`: Starting state name.
* `initialContext`: Initial context object.
* `enableBuiltinTools`: Enable `inspect_state_context`, `save_agent_note`, `save_state_info`, `reset_session` (default: `true`).
* `enableBuiltinResources`: Enable `state://current` resources (default: `true`).
* `decorateToolOutput`: Prepend state context banner to tool responses (default: `true`).

### `ToolExecutionContext` Helpers
Inside your `execute(args, helpers)` function:
* `helpers.transition(targetState, contextUpdates?)`: Transition to a valid target state.
* `helpers.saveStateInfo(key, value)`: Persist state data for the agent.
* `helpers.getStateInfo(key?)`: Retrieve saved state data.
* `helpers.saveAgentNote(note)`: Add to the agent's working scratchpad.
* `helpers.updateContext(updates)`: Modify session context without changing states.

---

## Development & Testing

```bash
# Run unit test suite
npm test

# Run realistic CRM SaaS example
npm run example:crm

# Run minimal example
npm run example:minimal

# Build package
npm run build
```

---

## License

MIT © [Antigravity](https://github.com/modelcontextprotocol)
