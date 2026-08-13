const crypto = require("crypto");

function requiredNumericEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!/^\d+$/.test(value)) throw new Error(`${name} não configurado corretamente.`);
  return value;
}

function getGitHubAppConfig() {
  const privateKey = String(process.env.CIBELE_GITHUB_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .trim();

  if (!privateKey.includes("PRIVATE KEY")) {
    throw new Error("CIBELE_GITHUB_PRIVATE_KEY não configurada corretamente.");
  }

  return {
    appId: requiredNumericEnv("CIBELE_GITHUB_APP_ID"),
    installationId: requiredNumericEnv("CIBELE_GITHUB_INSTALLATION_ID"),
    privateKey,
  };
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createAppJwt({ appId, privateKey, now = Math.floor(Date.now() / 1000) }) {
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const payload = encodeJson({ iat: now - 60, exp: now + 540, iss: String(appId) });
  const unsignedToken = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsignedToken), privateKey).toString("base64url");
  return `${unsignedToken}.${signature}`;
}

async function createInstallationToken({ fetchImpl = fetch } = {}) {
  const config = getGitHubAppConfig();
  const jwt = createAppJwt(config);
  const response = await fetchImpl(
    `https://api.github.com/app/installations/${config.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
        "User-Agent": "cibele-atendimento",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        repositories: ["Cibele"],
        permissions: { contents: "write" },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Falha ao obter credencial temporária do GitHub (${response.status}).`);
  }

  const data = await response.json();
  if (!data.token) throw new Error("O GitHub não retornou uma credencial temporária.");
  return data.token;
}

module.exports = {
  createAppJwt,
  createInstallationToken,
  getGitHubAppConfig,
};
