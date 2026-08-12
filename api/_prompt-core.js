const crypto = require("crypto");

const MIN_PROMPT_LENGTH = 2000;
const MAX_PROMPT_LENGTH = 100000;

const REQUIRED_SECTIONS = [
  {
    label: "identidade da IA",
    pattern: /^#{1,3}\s+(QUEM É VOCÊ|IDENTIDADE DA IA)(?:\s|$)/im,
  },
  {
    label: "missão ou objetivos",
    pattern: /^#{1,3}\s+(SUA MISSÃO|OBJETIVOS?)(?:\s|$)/im,
  },
  {
    label: "fluxo de atendimento",
    pattern: /^#{1,3}\s+(COMO VOCÊ CONDUZ|FLUXO DE ATENDIMENTO)(?:\s|$)/im,
  },
  {
    label: "restrições",
    pattern: /^#{1,3}\s+(O QUE VOCÊ NUNCA FAZ|RESTRIÇÕES)(?:\s|$)/im,
  },
];

const REQUIRED_RULES = [
  { label: "encaminhamento ao consultor", pattern: /consultor/i },
  { label: "proibição de inventar informações", pattern: /(?:n(?:ã|a)o|nunca)[^\n]{0,50}invent/i },
  { label: "regra do programa Au Pair", pattern: /Au Pair/i },
  { label: "estilo de conversa no WhatsApp", pattern: /WhatsApp/i },
];

function normalizePrompt(value) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : "";
}

function hashPrompt(value) {
  return crypto.createHash("sha256").update(normalizePrompt(value), "utf8").digest("hex");
}

function shortHash(value) {
  return hashPrompt(value).slice(0, 12);
}

function validatePrompt(value) {
  const prompt = normalizePrompt(value);
  const errors = [];

  if (!prompt) {
    errors.push("O prompt não pode estar vazio.");
    return { ok: false, prompt, errors };
  }

  if (prompt.length < MIN_PROMPT_LENGTH) {
    errors.push(`O prompt precisa ter pelo menos ${MIN_PROMPT_LENGTH} caracteres.`);
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    errors.push(`O prompt ultrapassa o limite de ${MAX_PROMPT_LENGTH} caracteres.`);
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!section.pattern.test(prompt)) {
      errors.push(`Seção obrigatória ausente: ${section.label}.`);
    }
  }

  for (const rule of REQUIRED_RULES) {
    if (!rule.pattern.test(prompt)) {
      errors.push(`Regra crítica ausente: ${rule.label}.`);
    }
  }

  return { ok: errors.length === 0, prompt, errors };
}

function getBearerToken(req) {
  const header = String((req.headers && req.headers.authorization) || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function safeTokenEquals(received, expected) {
  if (!received || !expected) return false;
  const receivedBuffer = Buffer.from(String(received));
  const expectedBuffer = Buffer.from(String(expected));
  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

function isAuthorized(req, expectedTokens) {
  const received = getBearerToken(req);
  return expectedTokens.filter(Boolean).some((expected) => safeTokenEquals(received, expected));
}

module.exports = {
  MAX_PROMPT_LENGTH,
  MIN_PROMPT_LENGTH,
  hashPrompt,
  getBearerToken,
  isAuthorized,
  normalizePrompt,
  shortHash,
  validatePrompt,
};
