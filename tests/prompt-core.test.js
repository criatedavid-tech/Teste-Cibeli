const test = require("node:test");
const assert = require("node:assert/strict");
const { isAuthorized, normalizePrompt, shortHash, validatePrompt } = require("../api/_prompt-core");

const validPrompt = `
# QUEM É VOCÊ
Você é a Cibele, especialista de atendimento da CI Intercâmbio.

# SUA MISSÃO
Atender, qualificar e encaminhar cada lead a um consultor.

# COMO VOCÊ CONDUZ A CONVERSA
Converse como uma pessoa no WhatsApp. Faça uma pergunta por vez.

# BASE DE CONHECIMENTO
Au Pair é um programa específico e deve respeitar todos os requisitos.

# O QUE VOCÊ NUNCA FAZ
Não invente informações, valores, políticas ou condições.

${"Contexto comercial validado. ".repeat(100)}
`;

test("normaliza quebras e espaços do prompt", () => {
  assert.equal(normalizePrompt("  A\r\nB  "), "A\nB");
});

test("aceita um prompt completo e gera versão estável", () => {
  const result = validatePrompt(validPrompt);
  assert.equal(result.ok, true);
  assert.equal(shortHash(validPrompt), shortHash(`\n${validPrompt.trim()}\n`));
});

test("recusa prompt vazio ou sem regras críticas", () => {
  assert.equal(validatePrompt("").ok, false);
  const result = validatePrompt("# QUEM É VOCÊ\nTexto curto");
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 1);
});

test("compara token de autorização sem aceitar aproximações", () => {
  const request = { headers: { authorization: "Bearer segredo-correto" } };
  assert.equal(isAuthorized(request, ["segredo-correto"]), true);
  assert.equal(isAuthorized(request, ["segredo-errado"]), false);
});
