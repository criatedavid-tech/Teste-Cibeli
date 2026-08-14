const crypto = require("crypto");

const COOKIE_NAME = "__Host-cibele_conversation_auth";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const SESSION_VERSION = "v1";

function safeEquals(received, expected) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(String(received));
  const expectedBuffer = Buffer.from(String(expected));
  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function signSession(expiresAt, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(`conversation-save:${SESSION_VERSION}:${expiresAt}`)
    .digest("base64url");
}

function createConversationSession(secret, now = Date.now()) {
  if (!secret) throw new Error("Segredo da autorização não configurado.");
  const expiresAt = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
  return `${SESSION_VERSION}.${expiresAt}.${signSession(expiresAt, secret)}`;
}

function createConversationSessionCookie(secret, now = Date.now()) {
  const session = createConversationSession(secret, now);
  return [
    `${COOKIE_NAME}=${session}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

function readCookie(req, name) {
  const header = String((req.headers && req.headers.cookie) || "");
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return part.slice(separator + 1).trim();
  }
  return "";
}

function hasValidConversationSession(req, secrets, now = Date.now()) {
  const session = readCookie(req, COOKIE_NAME);
  const [version, rawExpiresAt, signature, extra] = session.split(".");
  if (version !== SESSION_VERSION || !/^\d+$/.test(rawExpiresAt || "") || !signature || extra) {
    return false;
  }

  const expiresAt = Number(rawExpiresAt);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;

  return secrets
    .filter(Boolean)
    .some((secret) => safeEquals(signature, signSession(expiresAt, secret)));
}

module.exports = {
  COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createConversationSessionCookie,
  hasValidConversationSession,
};
