const { createConversationPath, createConversationRecord } = require("./_conversation-core");
const { createInstallationToken } = require("./_github-app");
const { fetchWorkflow, getSystemPrompt } = require("./_n8n-client");
const { isAuthorized, shortHash } = require("./_prompt-core");

const TRAINING_REPO = "cigoiania/Cibele";
const TRAINING_BRANCH = "claude/ci_goiania";
const ALLOWED_PATH = /^conversas\/pendentes\/\d{4}-\d{2}-\d{2}\/[a-zA-Z0-9_-]+\.json$/;

async function saveOnGitHub({ path, token, content, message, fetchImpl = fetch }) {
  if (!ALLOWED_PATH.test(path)) throw new Error("Caminho de conversa não autorizado.");

  const response = await fetchImpl(
    `https://api.github.com/repos/${TRAINING_REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "cibele-atendimento",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        branch: TRAINING_BRANCH,
        message,
        content: Buffer.from(content, "utf8").toString("base64"),
      }),
    }
  );

  if (!response.ok) throw new Error(`GitHub recusou o registro (${response.status}).`);
  return response.json();
}

async function handler(req, res) {
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

  try {
    const workflow = await fetchWorkflow();
    const promptVersion = shortHash(getSystemPrompt(workflow));
    const record = createConversationRecord({
      messages: req.body && req.body.messages,
      sessionId: req.body && req.body.sessionId,
      feedback: req.body && req.body.feedback,
      promptVersion,
    });
    const path = createConversationPath(record);
    const token = await createInstallationToken();
    const result = await saveOnGitHub({
      path,
      token,
      content: `${JSON.stringify(record, null, 2)}\n`,
      message: `Registra conversa fictícia de teste ${record.id}`,
    });

    console.log(JSON.stringify({
      event: "conversation_saved",
      id: record.id,
      path,
      promptVersion,
      at: record.createdAt,
    }));

    res.status(201).json({
      ok: true,
      id: record.id,
      path,
      promptVersion,
      url: (result.content && result.content.html_url) || null,
    });
  } catch (error) {
    if (error.validationErrors) {
      res.status(400).json({
        error: "Conversa rejeitada pela validação.",
        details: error.validationErrors,
      });
      return;
    }

    console.error(JSON.stringify({ event: "conversation_save_failed", message: error.message }));
    res.status(502).json({ error: "Não foi possível registrar a conversa no momento." });
  }
}

module.exports = handler;
module.exports.saveOnGitHub = saveOnGitHub;
