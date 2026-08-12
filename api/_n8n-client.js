const DEFAULT_N8N_BASE = "https://212n8n.criate.online";
const DEFAULT_WORKFLOW_ID = "kpuav6twkR2hnZ3r";
const AGENT_NODE_NAME = "AI Agent";

function getConfig() {
  const apiKey = process.env.N8N_API_KEY;
  if (!apiKey) {
    throw new Error("N8N_API_KEY não configurada no servidor.");
  }

  return {
    apiKey,
    baseUrl: (process.env.N8N_BASE_URL || DEFAULT_N8N_BASE).replace(/\/$/, ""),
    workflowId: process.env.N8N_WORKFLOW_ID || DEFAULT_WORKFLOW_ID,
  };
}

async function fetchWorkflow(config = getConfig()) {
  const response = await fetch(`${config.baseUrl}/api/v1/workflows/${config.workflowId}`, {
    headers: { "X-N8N-API-KEY": config.apiKey },
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar o workflow no n8n (${response.status}).`);
  }

  return response.json();
}

function findAgentNode(workflow) {
  const node = Array.isArray(workflow.nodes)
    ? workflow.nodes.find((item) => item.name === AGENT_NODE_NAME)
    : null;

  if (!node) {
    throw new Error(`Node "${AGENT_NODE_NAME}" não encontrado no workflow.`);
  }

  return node;
}

function getSystemPrompt(workflow) {
  const node = findAgentNode(workflow);
  return String(node.parameters && node.parameters.options && node.parameters.options.systemMessage || "");
}

function buildWorkflowPayload(workflow, systemPrompt) {
  const nodes = workflow.nodes.map((node) => {
    if (node.name !== AGENT_NODE_NAME) return node;
    return {
      ...node,
      parameters: {
        ...node.parameters,
        options: {
          ...(node.parameters && node.parameters.options),
          systemMessage: systemPrompt,
        },
      },
    };
  });

  return {
    name: workflow.name,
    nodes,
    connections: workflow.connections,
    settings: {
      executionOrder: (workflow.settings && workflow.settings.executionOrder) || "v1",
    },
  };
}

async function putWorkflow(workflow, systemPrompt, config = getConfig()) {
  const response = await fetch(`${config.baseUrl}/api/v1/workflows/${config.workflowId}`, {
    method: "PUT",
    headers: {
      "X-N8N-API-KEY": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildWorkflowPayload(workflow, systemPrompt)),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Falha ao atualizar o workflow (${response.status}): ${details.slice(0, 300)}`);
  }

  return response.json();
}

module.exports = {
  fetchWorkflow,
  getConfig,
  getSystemPrompt,
  putWorkflow,
};
