const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createConversationPath,
  createConversationRecord,
  validateConversation,
} = require("../api/_conversation-core");

test("recusa conversa incompleta", () => {
  const result = validateConversation([{ role: "user", content: "Oi" }]);
  assert.equal(result.ok, false);
});

test("cria registro rastreável somente na pasta pendentes", () => {
  const record = createConversationRecord({
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Como posso ajudar?" },
    ],
    sessionId: "web/sessão 01",
    feedback: "Abertura longa.",
    promptVersion: "abc123",
    now: new Date("2026-08-13T12:00:00.000Z"),
  });

  assert.equal(record.promptVersion, "abc123");
  assert.equal(record.sessionId, "web-sessao-01");
  assert.match(createConversationPath(record), /^conversas\/pendentes\/2026-08-13\//);
});
