const test = require("node:test");
const assert = require("node:assert/strict");
const { saveOnGitHub } = require("../api/save-conversation");

test("grava somente na branch e pasta oficiais", async () => {
  let request;
  await saveOnGitHub({
    path: "conversas/pendentes/2026-08-13/teste-123-sessao.json",
    token: "temporario",
    content: "{}\n",
    message: "Teste",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ content: {} }) };
    },
  });

  assert.equal(
    request.url,
    "https://api.github.com/repos/cigoiania/Cibele/contents/conversas/pendentes/2026-08-13/teste-123-sessao.json"
  );
  assert.equal(JSON.parse(request.options.body).branch, "claude/ci_goiania");
});

test("recusa tentativa de gravar fora de conversas pendentes", async () => {
  await assert.rejects(
    saveOnGitHub({
      path: "prompt/system-prompt-cibele.md",
      token: "temporario",
      content: "não autorizado",
      message: "Teste",
    }),
    /Caminho de conversa não autorizado/
  );
});
