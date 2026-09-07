import { StateMCP } from "../src/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

async function runSdkTests() {
  console.log("================================================");
  console.log("🧪 Running StateMCP SDK Comprehensive Test Suite");
  console.log("================================================\n");

  let passed = 0;
  function assert(condition: boolean, msg: string) {
    if (!condition) {
      throw new Error(`❌ Assertion failed: ${msg}`);
    }
    console.log(`  ✅ ${msg}`);
    passed++;
  }

  // 1. Initialization
  console.log("1️⃣ Testing SDK Initialization & State Definition...");
  const mcp = new StateMCP({
    name: "test-product-mcp",
    version: "1.0.0",
    initialState: "VIEW_A",
    initialContext: { count: 0 },
  });

  mcp
    .defineState("VIEW_A", {
      description: "First view",
      allowedTransitions: ["VIEW_B"],
    })
    .defineState("VIEW_B", {
      description: "Second view",
      allowedTransitions: ["VIEW_A"],
    });

  mcp.registerTool({
    name: "action_a",
    description: "Action only in View A",
    states: ["VIEW_A"],
    execute: async (_, { transition, saveStateInfo }) => {
      saveStateInfo("action_a_ran", true);
      transition("VIEW_B");
      return { ok: true };
    },
  });

  mcp.registerTool({
    name: "action_b",
    description: "Action only in View B",
    states: ["VIEW_B"],
    execute: async (_, { transition }) => {
      transition("VIEW_A");
      return { ok: true };
    },
  });

  const engine = mcp.getEngine();
  assert(engine.getSession().currentState === "VIEW_A", "Initial state is VIEW_A");

  // 2. Dynamic Tool Filtering
  console.log("\n2️⃣ Testing Dynamic Tool Filtering...");
  const toolsInA = engine.getActiveTools().map((t) => t.name);
  assert(toolsInA.includes("action_a"), "Tool 'action_a' is active in VIEW_A");
  assert(!toolsInA.includes("action_b"), "Tool 'action_b' is HIDDEN in VIEW_A");
  assert(toolsInA.includes("inspect_state_context"), "Built-in 'inspect_state_context' is active");
  assert(toolsInA.includes("save_agent_note"), "Built-in 'save_agent_note' is active");

  // 3. State Guardrail Rejection
  console.log("\n3️⃣ Testing Guardrails on Out-of-State Execution...");
  const illegalExec = await engine.executeTool("action_b", {});
  assert(!illegalExec.success, "Calling action_b in VIEW_A is rejected");
  assert(
    illegalExec.error!.includes("is NOT available in state 'VIEW_A'"),
    "Rejection error contains clear state violation message"
  );

  // 4. Valid Execution & Transition
  console.log("\n4️⃣ Testing Valid Tool Execution & State Transition...");
  const validExec = await engine.executeTool("action_a", {});
  assert(validExec.success, "action_a executes successfully");
  assert(engine.getSession().currentState === "VIEW_B", "State transitioned to VIEW_B");

  const toolsInB = engine.getActiveTools().map((t) => t.name);
  assert(toolsInB.includes("action_b"), "Tool 'action_b' is now active in VIEW_B");
  assert(!toolsInB.includes("action_a"), "Tool 'action_a' is now HIDDEN in VIEW_B");

  // 5. State Memory & Agent Notes Persistence
  console.log("\n5️⃣ Testing State Memory & Agent Notes...");
  const memory = engine.getMemory();
  assert(memory.getInfo("action_a_ran") === true, "State info 'action_a_ran' persisted across transition");

  // Agent saves a note
  await engine.executeTool("save_agent_note", { note: "Checked View B requirements" });
  assert(
    memory.getAgentNotes().some((n) => n.includes("Checked View B requirements")),
    "Agent note persisted in memory manager"
  );

  // Agent saves state metadata
  await engine.executeTool("save_state_info", { key: "selected_id", value: 9942 });
  assert(memory.getInfo("selected_id") === 9942, "Agent saved structured state info");

  // 6. State Summary Formatting
  console.log("\n6️⃣ Testing State Summary Card for LLM...");
  const summary = engine.getStateSummary();
  assert(summary.includes("CURRENT STATE: VIEW_B"), "Summary card contains current state");
  assert(summary.includes("selected_id: 9942"), "Summary card contains saved state info");
  assert(summary.includes("Checked View B requirements"), "Summary card contains agent notes");

  // 7. Reset Session & Memory Clear
  console.log("\n7️⃣ Testing Session Reset & Memory Clearing...");
  await engine.executeTool("reset_session", { clearMemory: true });
  assert(engine.getSession().currentState === "VIEW_A", "Session reset back to initial state VIEW_A");
  assert(Object.keys(engine.getMemory().getInfo()).length === 0, "State memory was cleared");
  assert(engine.getMemory().getAgentNotes().length === 0, "Agent notes were cleared");

  console.log("\n================================================");
  console.log(`🎉 ALL ${passed} ASSERTIONS PASSED! SDK VERIFIED.`);
  console.log("================================================\n");
}

runSdkTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
