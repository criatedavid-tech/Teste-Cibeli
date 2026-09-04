(() => {
  const STORAGE_HISTORY = "cibele_chat_history";
  const STORAGE_PROMPT = "cibele_system_prompt";
  const STORAGE_SESSION = "cibele_session_id";
  const STORAGE_LAST_SAVED_CONVERSATION = "cibele_last_saved_conversation";
  const DEFAULT_PROMPT_URL = "prompts/system-prompt-cibele.md";

  const chatScroll = document.getElementById("chat-scroll");
  const composer = document.getElementById("composer");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("btn-send");
  const resetBtn = document.getElementById("btn-reset");
  const saveConversationBtn = document.getElementById("btn-save-conversation");
  const openPromptBtn = document.getElementById("btn-open-prompt");
  const closePromptBtn = document.getElementById("btn-close-prompt");
  const promptOverlay = document.getElementById("prompt-overlay");
  const promptTextarea = document.getElementById("prompt-textarea");
  const promptVersion = document.getElementById("prompt-version");
  const restoreBtn = document.getElementById("btn-restore-prompt");
  const toast = document.getElementById("toast");
  const confirmOverlay = document.getElementById("confirm-overlay");
  const confirmCancelBtn = document.getElementById("btn-confirm-cancel");
  const confirmResetBtn = document.getElementById("btn-confirm-reset");

  let messages = [];
  let defaultPromptCache = null;
  let sending = false;
  const MAX_CHAT_ATTEMPTS = 4;

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function saveHistory() {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(messages));
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY);
      messages = raw ? JSON.parse(raw) : [];
    } catch {
      messages = [];
    }
  }

  function getCurrentPrompt() {
    return localStorage.getItem(STORAGE_PROMPT) || "";
  }

  function getSessionId() {
    let id = localStorage.getItem(STORAGE_SESSION);
    if (!id) {
      id = "web-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(STORAGE_SESSION, id);
    }
    return id;
  }

  async function fetchDefaultPrompt() {
    if (defaultPromptCache !== null) return defaultPromptCache;
    const res = await fetch(DEFAULT_PROMPT_URL);
    if (!res.ok) throw new Error("Não foi possível carregar o prompt padrão.");
    defaultPromptCache = await res.text();
    return defaultPromptCache;
  }

  async function fetchActivePrompt() {
    const res = await fetch("/api/prompt", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.systemPrompt) {
      throw new Error(data.error || "Não foi possível consultar o prompt publicado.");
    }
    return data;
  }

  function conversationFingerprint() {
    return JSON.stringify(messages);
  }

  function renderEmptyState() {
    const el = document.createElement("div");
    el.className = "empty-state";
    el.textContent = "Comece a conversa dizendo oi para a Cibele.";
    chatScroll.appendChild(el);
  }

  function renderBubble(role, content) {
    const row = document.createElement("div");
    row.className = `bubble-row ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = content;
    row.appendChild(bubble);
    chatScroll.appendChild(row);
    chatScroll.scrollTop = chatScroll.scrollHeight;
    return row;
  }

  function renderTyping() {
    const row = document.createElement("div");
    row.className = "bubble-row agent typing";
    row.id = "typing-indicator";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    row.appendChild(bubble);
    chatScroll.appendChild(row);
    chatScroll.scrollTop = chatScroll.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById("typing-indicator");
    if (el) el.remove();
  }

  function renderAll() {
    chatScroll.innerHTML = "";
    if (messages.length === 0) {
      renderEmptyState();
      return;
    }
    for (const m of messages) {
      renderBubble(m.role === "user" ? "user" : "agent", m.content);
    }
  }

  function autoResizeTextarea() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  }

  async function sendMessage(text) {
    if (sending) return;
    sending = true;
    sendBtn.disabled = true;

    if (messages.length === 0) chatScroll.innerHTML = "";
    const pendingMessage = { role: "user", content: text };
    messages.push(pendingMessage);
    const pendingRow = renderBubble("user", text);
    saveHistory();

    renderTyping();

    try {
      let res;
      let data;
      let retryNotice = null;

      for (let attempt = 0; attempt < MAX_CHAT_ATTEMPTS; attempt += 1) {
        try {
          res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: getSessionId(),
              messages: messages.map((m) => ({ role: m.role, content: m.content })),
            }),
          });
          data = await res.json().catch(() => ({}));
        } catch (requestError) {
          if (attempt === MAX_CHAT_ATTEMPTS - 1) throw requestError;
          data = { retryable: true, retryAfter: Math.min(30, 5 * (2 ** attempt)) };
        }

        if ((res && res.ok) || !data.retryable || attempt === MAX_CHAT_ATTEMPTS - 1) break;
        const retryAfter = Math.min(60, Math.max(1, Number(data.retryAfter) || 30));
        removeTyping();
        retryNotice = renderBubble(
          "system",
          `Serviço temporariamente ocupado. Tentando novamente em ${retryAfter} segundos...`
        );
        await wait(retryAfter * 1000);
        retryNotice.remove();
        retryNotice = null;
        renderTyping();
      }

      removeTyping();

      if (!res || !res.ok) {
        if (messages[messages.length - 1] === pendingMessage) {
          messages.pop();
          saveHistory();
        }
        pendingRow.remove();
        renderBubble("system", data.error || "Não foi possível falar com a Cibele agora.");
        return;
      }

      const reply = data.reply || "";
      messages.push({ role: "assistant", content: reply });
      renderBubble("agent", reply);
      saveHistory();
    } catch (err) {
      removeTyping();
      if (messages[messages.length - 1] === pendingMessage) {
        messages.pop();
        saveHistory();
      }
      pendingRow.remove();
      renderBubble("system", "Erro de conexão: " + err.message);
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  }

  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    autoResizeTextarea();
    sendMessage(text);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composer.requestSubmit();
    }
  });

  input.addEventListener("input", autoResizeTextarea);

  resetBtn.addEventListener("click", () => {
    confirmOverlay.classList.add("open");
  });

  confirmCancelBtn.addEventListener("click", () => {
    confirmOverlay.classList.remove("open");
  });

  confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) confirmOverlay.classList.remove("open");
  });

  confirmResetBtn.addEventListener("click", () => {
    messages = [];
    localStorage.removeItem(STORAGE_HISTORY);
    localStorage.removeItem(STORAGE_SESSION);
    localStorage.removeItem(STORAGE_LAST_SAVED_CONVERSATION);
    renderAll();
    confirmOverlay.classList.remove("open");
    showToast("Conversa reiniciada");
  });

  saveConversationBtn.addEventListener("click", async () => {
    if (messages.length < 2) {
      showToast("Converse com a Cibele antes de salvar o teste");
      return;
    }

    const fingerprint = conversationFingerprint();
    if (localStorage.getItem(STORAGE_LAST_SAVED_CONVERSATION) === fingerprint) {
      showToast("Esta versão da conversa já foi salva");
      return;
    }

    const publicRepoConfirmed = window.confirm(
      "Esta conversa será registrada em um repositório público. Salve somente testes fictícios, sem dados pessoais, documentos ou informações confidenciais. Deseja continuar?"
    );
    if (!publicRepoConfirmed) return;

    const feedback = window.prompt(
      "Observações para o Claude (opcional): o que funcionou ou precisa melhorar?"
    );
    if (feedback === null) return;

    saveConversationBtn.disabled = true;
    try {
      const res = await fetch("/api/save-conversation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: getSessionId(),
          feedback: feedback.trim(),
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Não foi possível salvar a conversa");
        return;
      }

      localStorage.setItem(STORAGE_LAST_SAVED_CONVERSATION, fingerprint);
      showToast("Conversa salva para análise");
    } catch (err) {
      showToast("Erro ao salvar conversa: " + err.message);
    } finally {
      saveConversationBtn.disabled = false;
    }
  });

  openPromptBtn.addEventListener("click", async () => {
    promptVersion.textContent = "Consultando versão ativa...";
    try {
      const active = await fetchActivePrompt();
      promptTextarea.value = active.systemPrompt;
      localStorage.setItem(STORAGE_PROMPT, active.systemPrompt);
      promptVersion.textContent = `Versão ativa: ${active.version}`;
    } catch (err) {
      try {
        promptTextarea.value = getCurrentPrompt() || (await fetchDefaultPrompt());
        promptVersion.textContent = "Versão local de contingência — serviço temporariamente indisponível";
      } catch {
        promptTextarea.value = "";
        promptVersion.textContent = "Não foi possível carregar o prompt";
      }
      showToast("Erro ao consultar o prompt ativo: " + err.message);
    }
    promptOverlay.classList.add("open");
  });

  closePromptBtn.addEventListener("click", () => {
    promptOverlay.classList.remove("open");
  });

  promptOverlay.addEventListener("click", (e) => {
    if (e.target === promptOverlay) promptOverlay.classList.remove("open");
  });

  restoreBtn.addEventListener("click", async () => {
    try {
      const active = await fetchActivePrompt();
      promptTextarea.value = active.systemPrompt;
      localStorage.setItem(STORAGE_PROMPT, active.systemPrompt);
      promptVersion.textContent = `Versão ativa: ${active.version}`;
      showToast("Versão publicada recarregada");
    } catch (err) {
      showToast("Erro ao restaurar: " + err.message);
    }
  });

  (async function init() {
    loadHistory();
    renderAll();
    if (!getCurrentPrompt()) {
      try {
        const def = await fetchDefaultPrompt();
        localStorage.setItem(STORAGE_PROMPT, def);
      } catch {
        /* segue sem prompt padrão pré-carregado; api vai reclamar se faltar */
      }
    }
  })();
})();
