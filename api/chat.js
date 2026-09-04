const DEFAULT_WEBHOOK_URL =
  "https://212n8n.criate.online/webhook/ci-intercambio-cibele-teste";

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARACTERS = 6000;
const DEFAULT_RETRY_AFTER_SECONDS = 30;

function selectRecentHistory(messages) {
  const selected = [];
  let characters = 0;

  for (let index = messages.length - 1; index >= 0 && selected.length < MAX_HISTORY_MESSAGES; index -= 1) {
    const message = messages[index];
    const content = String((message && message.content) || "");
    const remaining = MAX_HISTORY_CHARACTERS - characters;
    if (remaining <= 0) break;
    const retainedContent = content.length > remaining ? content.slice(-remaining) : content;
    selected.unshift({ ...message, content: retainedContent });
    characters += retainedContent.length;
  }

  return selected;
}

function buildChatInput(messages) {
  const last = messages[messages.length - 1];
  const history = selectRecentHistory(messages.slice(0, -1));
  const transcript = history
    .map((message) => (message.role === "user" ? "Cliente: " : "Atendente: ") + message.content)
    .join("\n");

  return transcript ? `${transcript}\nCliente: ${last.content}` : last.content;
}

function getRetryAfterSeconds(response, rawText) {
  const headerValue = Number(response.headers && response.headers.get("retry-after"));
  const bodyMatch = String(rawText).match(/try again in\s+(\d+(?:\.\d+)?)s/i);
  const detected = Number.isFinite(headerValue) && headerValue > 0
    ? headerValue
    : bodyMatch
      ? Number(bodyMatch[1])
      : DEFAULT_RETRY_AFTER_SECONDS;
  return Math.min(60, Math.max(1, Math.ceil(detected)));
}

function isRateLimitResponse(response, rawText) {
  return response.status === 429 || /rate limit|tokens per min|too many requests/i.test(String(rawText));
}

function isTemporaryResponse(response, rawText) {
  return isRateLimitResponse(response, rawText) || response.status >= 500;
}

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

  const chatInput = buildChatInput(messages);

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
      if (isTemporaryResponse(response, rawText)) {
        const retryAfter = getRetryAfterSeconds(response, rawText);
        res.setHeader("Retry-After", String(retryAfter));
        res.status(429).json({
          error: "Muitas mensagens em sequência. Aguarde um instante; vamos tentar novamente.",
          retryAfter,
          retryable: true,
        });
        return;
      }
      res.status(502).json({ error: "O atendimento está temporariamente indisponível.", retryable: false });
      return;
    }

    const reply = (data && (data.output || data.reply || data.text)) || "";
    res.status(200).json({ reply });
  } catch (err) {
    console.error("Falha interna ao processar o atendimento:", err);
    res.setHeader("Retry-After", "5");
    res.status(503).json({
      error: "A conexão oscilou. Aguarde um instante; vamos tentar novamente.",
      retryAfter: 5,
      retryable: true,
    });
  }
};

module.exports.buildChatInput = buildChatInput;
module.exports.getRetryAfterSeconds = getRetryAfterSeconds;
module.exports.isRateLimitResponse = isRateLimitResponse;
module.exports.isTemporaryResponse = isTemporaryResponse;
