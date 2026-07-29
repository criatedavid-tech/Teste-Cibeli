const DEFAULT_N8N_BASE = "https://212n8n.criate.online";
const DEFAULT_WORKFLOW_ID = "kpuav6twkR2hnZ3r";
const AGENT_NODE_NAME = "AI Agent";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const apiKey = process.env.N8N_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "N8N_API_KEY não configurada no servidor. Sem ela não dá para publicar o prompt no n8n.",
    });
    return;
  }

  const { systemPrompt } = req.body || {};
  if (!systemPrompt || typeof systemPrompt !== "string") {
    res.status(400).json({ error: "Campo systemPrompt é obrigatório." });
    return;
  }

  const n8nBase = process.env.N8N_BASE_URL || DEFAULT_N8N_BASE;
  const workflowId = process.env.N8N_WORKFLOW_ID || DEFAULT_WORKFLOW_ID;

  try {
    const getRes = await fetch(`${n8nBase}/api/v1/workflows/${workflowId}`, {
      headers: { "X-N8N-API-KEY": apiKey },
    });
    if (!getRes.ok) {
      res.status(502).json({ error: `Falha ao buscar o workflow no n8n (${getRes.status}).` });
      return;
    }
    const wf = await getRes.json();

    const nodes = wf.nodes.map((n) => {
      if (n.name === AGENT_NODE_NAME) {
        return {
          ...n,
          parameters: {
            ...n.parameters,
            options: { ...n.parameters.options, systemMessage: systemPrompt },
          },
        };
      }
      return n;
    });

    const payload = {
      name: wf.name,
      nodes,
      connections: wf.connections,
      settings: { executionOrder: (wf.settings && wf.settings.executionOrder) || "v1" },
    };

    const putRes = await fetch(`${n8nBase}/api/v1/workflows/${workflowId}`, {
      method: "PUT",
      headers: { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      res.status(502).json({ error: `Falha ao atualizar o workflow (${putRes.status}): ${errText.slice(0, 300)}` });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: `Erro ao publicar no n8n: ${err.message}` });
  }
};
