const crypto = require("crypto");

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "cibele-prompt-sync";
const ALLOWED_REPOSITORY = "cigoiania/Cibele";
const ALLOWED_REF = "refs/heads/claude/ci_goiania";
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const CLOCK_TOLERANCE_SECONDS = 30;
const JWKS_CACHE_MS = 60 * 60 * 1000;

let jwksCache = null;

function decodeBase64Url(value) {
  return Buffer.from(value, "base64url");
}

function parseToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("Token OIDC inválido.");
  const header = JSON.parse(decodeBase64Url(parts[0]).toString("utf8"));
  const claims = JSON.parse(decodeBase64Url(parts[1]).toString("utf8"));
  return {
    header,
    claims,
    signature: decodeBase64Url(parts[2]),
    signingInput: `${parts[0]}.${parts[1]}`,
  };
}

function validateClaims(claims, nowSeconds = Math.floor(Date.now() / 1000)) {
  return Boolean(
    claims &&
    claims.iss === ISSUER &&
    claims.aud === AUDIENCE &&
    claims.repository === ALLOWED_REPOSITORY &&
    claims.ref === ALLOWED_REF &&
    ["push", "workflow_dispatch"].includes(claims.event_name) &&
    String(claims.sub || "").startsWith(`repo:${ALLOWED_REPOSITORY}:`) &&
    Number(claims.exp) >= nowSeconds - CLOCK_TOLERANCE_SECONDS &&
    Number(claims.nbf || 0) <= nowSeconds + CLOCK_TOLERANCE_SECONDS
  );
}

async function fetchJwks() {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys;
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error(`Falha ao consultar chaves OIDC (${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw new Error("Resposta OIDC sem chaves públicas.");
  jwksCache = { keys: data.keys, expiresAt: now + JWKS_CACHE_MS };
  return data.keys;
}

async function verifyGitHubOidc(token) {
  try {
    const parsed = parseToken(token);
    if (parsed.header.alg !== "RS256" || !parsed.header.kid) return false;
    if (!validateClaims(parsed.claims)) return false;

    const keys = await fetchJwks();
    const jwk = keys.find((key) => key.kid === parsed.header.kid && key.kty === "RSA");
    if (!jwk) return false;

    const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
    return crypto.verify(
      "RSA-SHA256",
      Buffer.from(parsed.signingInput, "utf8"),
      publicKey,
      parsed.signature
    );
  } catch {
    return false;
  }
}

module.exports = { validateClaims, verifyGitHubOidc };
