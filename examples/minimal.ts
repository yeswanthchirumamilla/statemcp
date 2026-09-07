import { StateMCP } from "../src/index.js";

// 1. Initialize StateMCP for your product
const app = new StateMCP({
  name: "minimal-product",
  initialState: "HOME",
  initialContext: { visits: 0 },
});

// 2. Define workflow states
app
  .defineState("HOME", {
    description: "Welcome screen of the product",
    allowedTransitions: ["DASHBOARD"],
  })
  .defineState("DASHBOARD", {
    description: "Personal user analytics dashboard",
    allowedTransitions: ["HOME"],
  });

// 3. Register state-specific tools
app.registerTool({
  name: "enter_dashboard",
  description: "Navigate from welcome screen to personal dashboard",
  states: ["HOME"], // Only exposed when in HOME!
  execute: async (_, { transition, saveStateInfo }) => {
    saveStateInfo("entered_at", new Date().toISOString());
    transition("DASHBOARD");
    return { message: "Welcome to your personal dashboard!" };
  },
});

app.registerTool({
  name: "fetch_analytics",
  description: "Retrieve dashboard metrics",
  states: ["DASHBOARD"], // Only exposed when in DASHBOARD!
  execute: async (_, { getStateInfo }) => {
    return {
      enteredAt: getStateInfo("entered_at"),
      activeUsers: 1420,
      systemHealth: "99.99%",
    };
  },
});

console.log("Minimal product configured successfully with StateMCP!");
console.log(`Initial Active Tools:`, app.getEngine().getActiveTools().map(t => t.name));
