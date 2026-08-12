const test = require("node:test");
const assert = require("node:assert/strict");
const syncPrompt = require("../api/sync-prompt");

const completePrompt = `
# QUEM É VOCÊ
Você é a Cibele da CI Intercâmbio.
# SUA MISSÃO
Qualificar e encaminhar o lead ao consultor.
# COMO VOCÊ CONDUZ A CONVERSA
Converse naturalmente pelo WhatsApp.
# BASE DE CONHECIMENTO
Au Pair deve seguir os requisitos oficiais.
# O QUE VOCÊ NUNCA FAZ
Não invente informações ou condições.
${"Conhecimento comercial aprovado. ".repeat(100)}
`.trim();

function workflow(prompt) {
  return {
    name: "Teste",
    nodes: [{
      name: "AI Agent",
      parameters: { options: { systemMessage: prompt } },
    }],
    connections: {},
    settings: { executionOrder: "v1" },
  };
}

function request(token, prompt = completePrompt) {
  return {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: { systemPrompt: prompt },
  };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function mockJsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

test("bloqueia publicação sem token válido", async () => {
  process.env.PROMPT_SYNC_TOKEN = "segredo";
  const res = response();
  await syncPrompt(request("incorreto"), res);
  assert.equal(res.statusCode, 401);
});

test("publica e verifica uma nova versão", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  process.env.PROMPT_SYNC_TOKEN = "segredo";
  process.env.N8N_API_KEY = "n8n-teste";

  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (calls.length === 1) return mockJsonResponse(workflow(completePrompt + "\nversão anterior"));
    if (calls.length === 2) return mockJsonResponse({ ok: true });
    return mockJsonResponse(workflow(completePrompt));
  };

  const res = response();
  await syncPrompt(request("segredo"), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.changed, true);
  assert.equal(calls.length, 3);
});

test("tenta rollback quando a verificação diverge", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  process.env.PROMPT_SYNC_TOKEN = "segredo";
  process.env.N8N_API_KEY = "n8n-teste";

  const previous = completePrompt + "\nversão anterior";
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (calls.length === 1) return mockJsonResponse(workflow(previous));
    if (calls.length === 2) return mockJsonResponse({ ok: true });
    if (calls.length === 3) return mockJsonResponse(workflow(previous));
    return mockJsonResponse({ ok: true });
  };

  const res = response();
  await syncPrompt(request("segredo"), res);
  assert.equal(res.statusCode, 502);
  assert.equal(calls.length, 4);
  const rollbackBody = JSON.parse(calls[3].options.body);
  assert.equal(rollbackBody.nodes[0].parameters.options.systemMessage, previous);
});
