const test = require("node:test");
const assert = require("node:assert/strict");
const chat = require("../api/chat");

function response(status, retryAfter = null) {
  return {
    status,
    headers: { get: (name) => name === "retry-after" ? retryAfter : null },
  };
}

function handlerResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
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

test("mantém somente o histórico recente dentro do limite", () => {
  const messages = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `mensagem-${index}`,
  }));

  const input = chat.buildChatInput(messages);
  assert.doesNotMatch(input, /mensagem-0(?:\n|$)/);
  assert.match(input, /mensagem-19$/);
  assert.ok(input.split("\n").length <= 13);
});

test("corta históricos excepcionalmente longos", () => {
  const input = chat.buildChatInput([
    { role: "assistant", content: "x".repeat(10000) },
    { role: "user", content: "resposta" },
  ]);
  assert.ok(input.length < 6100);
  assert.match(input, /Cliente: resposta$/);
});

test("identifica limite temporário e respeita o tempo recomendado", () => {
  const upstream = response(500);
  const body = "Rate limit reached on tokens per min. Please try again in 19.55s.";
  assert.equal(chat.isRateLimitResponse(upstream, body), true);
  assert.equal(chat.getRetryAfterSeconds(upstream, body), 20);
});

test("prioriza Retry-After e limita a espera máxima", () => {
  assert.equal(chat.getRetryAfterSeconds(response(429, "75"), ""), 60);
  assert.equal(chat.getRetryAfterSeconds(response(429, "2"), ""), 2);
});

test("trata indisponibilidade temporária sem confundir erro definitivo", () => {
  assert.equal(chat.isTemporaryResponse(response(500), "Erro no fluxo"), true);
  assert.equal(chat.isTemporaryResponse(response(400), "Dados inválidos"), false);
});

test("marca oscilação de rede como recuperável", async (context) => {
  const originalFetch = global.fetch;
  context.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => { throw new Error("conexão interrompida"); };

  const res = handlerResponse();
  await chat({
    method: "POST",
    body: { messages: [{ role: "user", content: "teste" }], sessionId: "sessao" },
  }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.retryable, true);
  assert.equal(res.payload.retryAfter, 5);
  assert.equal(res.headers["retry-after"], "5");
});
