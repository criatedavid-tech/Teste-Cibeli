const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { createAppJwt, createInstallationToken } = require("../api/_github-app");

test("gera JWT curto e assinado para autenticar a GitHub App", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const now = 1_786_620_000;
  const token = createAppJwt({ appId: "4585411", privateKey, now });
  const [header, payload, signature] = token.split(".");

  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), {
    iat: now - 60,
    exp: now + 540,
    iss: "4585411",
  });
  assert.equal(
    crypto.verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")),
    true
  );
});

test("solicita token temporário limitado ao repositório Cibele", async () => {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const previous = {
    appId: process.env.CIBELE_GITHUB_APP_ID,
    installationId: process.env.CIBELE_GITHUB_INSTALLATION_ID,
    privateKey: process.env.CIBELE_GITHUB_PRIVATE_KEY,
  };
  process.env.CIBELE_GITHUB_APP_ID = "123";
  process.env.CIBELE_GITHUB_INSTALLATION_ID = "456";
  process.env.CIBELE_GITHUB_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });

  let request;
  try {
    const token = await createInstallationToken({
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { ok: true, json: async () => ({ token: "temporario" }) };
      },
    });
    assert.equal(token, "temporario");
    assert.equal(request.url, "https://api.github.com/app/installations/456/access_tokens");
    assert.deepEqual(JSON.parse(request.options.body), {
      repositories: ["Cibele"],
      permissions: { contents: "write" },
    });
  } finally {
    if (previous.appId === undefined) delete process.env.CIBELE_GITHUB_APP_ID;
    else process.env.CIBELE_GITHUB_APP_ID = previous.appId;
    if (previous.installationId === undefined) delete process.env.CIBELE_GITHUB_INSTALLATION_ID;
    else process.env.CIBELE_GITHUB_INSTALLATION_ID = previous.installationId;
    if (previous.privateKey === undefined) delete process.env.CIBELE_GITHUB_PRIVATE_KEY;
    else process.env.CIBELE_GITHUB_PRIVATE_KEY = previous.privateKey;
  }
});
