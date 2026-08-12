const { fetchWorkflow, getSystemPrompt } = require("./_n8n-client");
const { shortHash } = require("./_prompt-core");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  try {
    const workflow = await fetchWorkflow();
    const systemPrompt = getSystemPrompt(workflow);
    if (!systemPrompt.trim()) {
      res.status(502).json({ error: "O prompt ativo no n8n está vazio." });
      return;
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      systemPrompt,
      version: shortHash(systemPrompt),
      updatedAt: workflow.updatedAt || null,
      source: "n8n",
    });
  } catch (err) {
    res.status(502).json({ error: `Falha ao consultar o prompt ativo: ${err.message}` });
  }
};
