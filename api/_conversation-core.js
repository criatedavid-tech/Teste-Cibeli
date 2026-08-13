const crypto = require("crypto");

const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 10000;
const MAX_TOTAL_LENGTH = 150000;

function normalizeMessages(value) {
  if (!Array.isArray(value)) return [];
  return value.map((message) => ({
    role: message && message.role === "assistant" ? "assistant" : "user",
    content: String((message && message.content) || "").trim(),
  }));
}

function validateConversation(value) {
  const messages = normalizeMessages(value);
  const errors = [];

  if (messages.length < 2) errors.push("A conversa precisa ter pelo menos duas mensagens.");
  if (messages.length > MAX_MESSAGES) errors.push(`A conversa ultrapassa ${MAX_MESSAGES} mensagens.`);

  let totalLength = 0;
  messages.forEach((message, index) => {
    totalLength += message.content.length;
    if (!message.content) errors.push(`A mensagem ${index + 1} está vazia.`);
    if (message.content.length > MAX_MESSAGE_LENGTH) {
      errors.push(`A mensagem ${index + 1} ultrapassa ${MAX_MESSAGE_LENGTH} caracteres.`);
    }
  });

  if (totalLength > MAX_TOTAL_LENGTH) {
    errors.push(`A conversa ultrapassa ${MAX_TOTAL_LENGTH} caracteres.`);
  }

  return { ok: errors.length === 0, messages, errors };
}

function safeIdentifier(value) {
  return String(value || "sessao")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

function createConversationRecord({ messages, sessionId, feedback, promptVersion, now = new Date() }) {
  const validation = validateConversation(messages);
  if (!validation.ok) {
    const error = new Error(validation.errors.join(" "));
    error.validationErrors = validation.errors;
    throw error;
  }

  const id = `teste-${now.toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
  return {
    schemaVersion: 1,
    id,
    createdAt: now.toISOString(),
    source: "cibele-atendimento.vercel.app",
    sessionId: safeIdentifier(sessionId),
    promptVersion: promptVersion || null,
    status: "pendente",
    feedback: String(feedback || "").trim().slice(0, 4000),
    notice: "Conversa fictícia de teste. Não usar como verdade comercial sem validação explícita do Marcelo.",
    messages: validation.messages,
  };
}

function createConversationPath(record) {
  const date = record.createdAt.slice(0, 10);
  return `conversas/pendentes/${date}/${record.id}-${safeIdentifier(record.sessionId)}.json`;
}

module.exports = {
  createConversationPath,
  createConversationRecord,
  safeIdentifier,
  validateConversation,
};
