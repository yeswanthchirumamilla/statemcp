import { StateMCP } from "../src/index.js";

interface CrmContext {
  organizationId: string;
  activeLeadId?: string;
  dealValue?: number;
}

// 1. Initialize StateMCP for Acme CRM
const crm = new StateMCP<CrmContext>({
  name: "acme-crm-mcp",
  version: "2.4.0",
  initialState: "DASHBOARD",
  initialContext: {
    organizationId: "org-stellar-77",
  },
});

// 2. Define CRM workflow states
crm
  .defineState("DASHBOARD", {
    description: "Executive CRM dashboard. Overview of leads and pipeline revenue.",
    allowedTransitions: ["LEAD_PROFILE"],
  })
  .defineState("LEAD_PROFILE", {
    description: "Single lead inspection and qualification view.",
    allowedTransitions: ["DASHBOARD", "DEAL_ROOM"],
  })
  .defineState("DEAL_ROOM", {
    description: "Active deal negotiation, pricing discounts, and contract review.",
    allowedTransitions: ["LEAD_PROFILE", "INVOICE_SENT"],
  })
  .defineState("INVOICE_SENT", {
    description: "Deal closed and invoice dispatched to customer.",
    allowedTransitions: ["DASHBOARD"],
  });

// 3. Register state-gated tools

// DASHBOARD TOOLS
crm.registerTool({
  name: "search_leads",
  description: "Search CRM leads database by company name or industry.",
  states: ["DASHBOARD"],
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Company name or contact" },
    },
    required: ["query"],
  },
  execute: async (args: { query: string }, { saveStateInfo }) => {
    const leads = [
      { id: "lead-401", company: "Cyberdyne Systems", ARR: 120000, status: "Warm" },
      { id: "lead-402", company: "Wayne Enterprises", ARR: 450000, status: "Hot" },
    ];
    saveStateInfo("last_search_query", args.query);
    return { matchingLeads: leads };
  },
});

crm.registerTool({
  name: "open_lead_record",
  description: "Open the profile of a lead to begin qualification.",
  states: ["DASHBOARD"],
  inputSchema: {
    type: "object",
    properties: {
      leadId: { type: "string", description: "Unique lead ID (e.g. 'lead-402')" },
    },
    required: ["leadId"],
  },
  execute: async (args: { leadId: string }, { transition, saveStateInfo, saveAgentNote }) => {
    saveStateInfo("active_lead_id", args.leadId);
    saveStateInfo("lead_opened_at", new Date().toISOString());
    saveAgentNote(`Opened lead ${args.leadId} for evaluation.`);

    transition("LEAD_PROFILE", { activeLeadId: args.leadId });

    return {
      message: `Navigated to profile for ${args.leadId}`,
      contact: "Bruce Wayne",
      title: "CEO",
      dealInterest: "Enterprise Cloud License",
      estimatedValue: 450000,
    };
  },
});

// LEAD_PROFILE TOOLS
crm.registerTool({
  name: "qualify_and_create_deal",
  description: "Qualify the current lead and advance them to the active Deal Room.",
  states: ["LEAD_PROFILE"],
  inputSchema: {
    type: "object",
    properties: {
      agreedBudget: { type: "number", description: "Agreed customer budget in USD" },
      timelineMonths: { type: "number", description: "Implementation timeline" },
    },
    required: ["agreedBudget"],
  },
  execute: async (
    args: { agreedBudget: number; timelineMonths?: number },
    { transition, saveStateInfo, saveAgentNote }
  ) => {
    saveStateInfo("qualified_budget", args.agreedBudget);
    saveStateInfo("deal_stage", "Negotiation");
    saveAgentNote(`Lead qualified with budget $${args.agreedBudget.toLocaleString()}`);

    transition("DEAL_ROOM", { dealValue: args.agreedBudget });

    return {
      message: "Lead successfully qualified. Advanced to DEAL_ROOM.",
      contractDraftId: "CTR-88912",
      proposedARR: `$${args.agreedBudget.toLocaleString()}`,
    };
  },
});

// DEAL_ROOM TOOLS
crm.registerTool({
  name: "send_final_invoice",
  description: "Issue the binding contract and dispatch invoice to customer.",
  states: ["DEAL_ROOM"],
  inputSchema: {
    type: "object",
    properties: {
      billingEmail: { type: "string", description: "Recipient billing email" },
    },
    required: ["billingEmail"],
  },
  execute: async (args: { billingEmail: string }, { transition, saveStateInfo, saveAgentNote }) => {
    const invoiceId = `INV-${Math.floor(10000 + Math.random() * 90000)}`;
    saveStateInfo("invoice_id", invoiceId);
    saveStateInfo("invoice_recipient", args.billingEmail);
    saveAgentNote(`Invoice ${invoiceId} sent to ${args.billingEmail}`);

    transition("INVOICE_SENT");

    return {
      status: "DISPATCHED",
      invoiceId,
      sentTo: args.billingEmail,
      terms: "Net 30",
    };
  },
});

// If executed directly, demonstrate the flow programmatically
async function main() {
  console.log("=================================================");
  console.log("🏢 Running Acme CRM Example with StateMCP SDK");
  console.log("=================================================\n");

  const engine = crm.getEngine();

  console.log("1. Initial State:", engine.getSession().currentState);
  console.log("   Active Tools on Dashboard:", engine.getActiveTools().map((t) => t.name));

  console.log("\n2. Executing 'open_lead_record'...");
  const res1 = await engine.executeTool("open_lead_record", { leadId: "lead-402" });
  console.log("   New State:", res1.currentState);
  console.log("   Active Tools in LEAD_PROFILE:", engine.getActiveTools().map((t) => t.name));

  console.log("\n3. Inspecting Saved State Information:");
  console.log(engine.getMemory().getInfo());

  console.log("\n4. Qualifying deal and advancing to DEAL_ROOM...");
  const res2 = await engine.executeTool("qualify_and_create_deal", { agreedBudget: 450000 });
  console.log("   New State:", res2.currentState);
  console.log("   Active Tools in DEAL_ROOM:", engine.getActiveTools().map((t) => t.name));

  console.log("\n5. Checking State Summary Card for LLM:");
  console.log("-----------------------------------------");
  console.log(engine.getStateSummary());
  console.log("-----------------------------------------");
}

main().catch(console.error);
