const { createConversationSessionCookie, SESSION_MAX_AGE_SECONDS } = require("./_conversation-auth");
const { isAuthorized } = require("./_prompt-core");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const adminTokens = [process.env.CONVERSATION_SAVE_TOKEN, process.env.CIBELE_ADMIN_TOKEN].filter(Boolean);
  if (adminTokens.length === 0) {
    res.status(503).json({ error: "Salvamento de conversas ainda não configurado." });
    return;
  }
  if (!isAuthorized(req, adminTokens)) {
    res.status(401).json({ error: "Chave de salvamento inválida." });
    return;
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Set-Cookie", createConversationSessionCookie(adminTokens[0]));
  res.status(200).json({ ok: true, expiresIn: SESSION_MAX_AGE_SECONDS });
};
