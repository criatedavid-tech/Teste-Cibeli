const test = require("node:test");
const assert = require("node:assert/strict");
const {
  COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createConversationSessionCookie,
  hasValidConversationSession,
} = require("../api/_conversation-auth");
const authorizeConversationSave = require("../api/authorize-conversation-save");

const SECRET = "chave-de-teste-comprida-e-segura";
const NOW = Date.UTC(2026, 7, 14, 12, 0, 0);

function requestWithCookie(cookie) {
  return { headers: { cookie: cookie.split(";")[0] } };
}

function response() {
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

test("cria autorização persistente com cookie protegido", () => {
  const cookie = createConversationSessionCookie(SECRET, NOW);
  assert.match(cookie, new RegExp(`^${COOKIE_NAME}=`));
  assert.match(cookie, new RegExp(`Max-Age=${SESSION_MAX_AGE_SECONDS}`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(hasValidConversationSession(requestWithCookie(cookie), [SECRET], NOW), true);
});

test("recusa autorização expirada, adulterada ou assinada por outra chave", () => {
  const cookie = createConversationSessionCookie(SECRET, NOW);
  const expiredAt = NOW + (SESSION_MAX_AGE_SECONDS + 1) * 1000;
  const [cookiePair, ...attributes] = cookie.split("; ");
  const replacement = cookiePair.endsWith("a") ? "b" : "a";
  const tamperedCookie = `${cookiePair.slice(0, -1)}${replacement}; ${attributes.join("; ")}`;
  assert.equal(hasValidConversationSession(requestWithCookie(cookie), [SECRET], expiredAt), false);
  assert.equal(hasValidConversationSession(requestWithCookie(tamperedCookie), [SECRET], NOW), false);
  assert.equal(hasValidConversationSession(requestWithCookie(cookie), ["outra-chave"], NOW), false);
});

test("endpoint autoriza somente a chave correta e grava o cookie", async (context) => {
  const previous = process.env.CONVERSATION_SAVE_TOKEN;
  context.after(() => {
    if (previous === undefined) delete process.env.CONVERSATION_SAVE_TOKEN;
    else process.env.CONVERSATION_SAVE_TOKEN = previous;
  });
  process.env.CONVERSATION_SAVE_TOKEN = SECRET;

  const invalidResponse = response();
  await authorizeConversationSave({ method: "POST", headers: { authorization: "Bearer incorreta" } }, invalidResponse);
  assert.equal(invalidResponse.statusCode, 401);
  assert.equal(invalidResponse.headers["set-cookie"], undefined);

  const validResponse = response();
  await authorizeConversationSave({ method: "POST", headers: { authorization: `Bearer ${SECRET}` } }, validResponse);
  assert.equal(validResponse.statusCode, 200);
  assert.equal(validResponse.payload.ok, true);
  assert.match(validResponse.headers["set-cookie"], /HttpOnly/);
});
