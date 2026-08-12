const DEFAULT_WEBHOOK_URL =
  "https://212n8n.criate.online/webhook/ci-intercambio-cibele-teste";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;

  const body = req.body || {};
  const { messages, sessionId } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Campo messages é obrigatório e deve conter ao menos uma mensagem." });
    return;
  }

  const last = messages[messages.length - 1];
  const history = messages.slice(0, -1);

  // O agente roda num workflow n8n que não mantém memória entre chamadas,
  // então embutimos o histórico no próprio chatInput a cada requisição.
  const transcript = history
    .map((m) => (m.role === "user" ? "Cliente: " : "Cibele: ") + m.content)
    .join("\n");

  const chatInput = transcript ? `${transcript}\nCliente: ${last.content}` : last.content;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatInput,
        sessionId: sessionId || "web",
      }),
    });

    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }

    if (!response.ok) {
      console.error("Falha interna no atendimento:", response.status, rawText.slice(0, 500));
      res.status(502).json({ error: "O atendimento está temporariamente indisponível." });
      return;
    }

    const reply = (data && (data.output || data.reply || data.text)) || "";
    res.status(200).json({ reply });
  } catch (err) {
    console.error("Falha interna ao processar o atendimento:", err);
    res.status(500).json({ error: "Falha ao processar o atendimento." });
  }
};
