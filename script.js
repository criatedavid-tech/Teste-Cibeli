(() => {
  const STORAGE_HISTORY = "cibele_chat_history";
  const STORAGE_PROMPT = "cibele_system_prompt";
  const STORAGE_SESSION = "cibele_session_id";
  const DEFAULT_PROMPT_URL = "prompts/system-prompt-cibele.md";

  const chatScroll = document.getElementById("chat-scroll");
  const composer = document.getElementById("composer");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("btn-send");
  const resetBtn = document.getElementById("btn-reset");
  const openPromptBtn = document.getElementById("btn-open-prompt");
  const closePromptBtn = document.getElementById("btn-close-prompt");
  const promptOverlay = document.getElementById("prompt-overlay");
  const promptTextarea = document.getElementById("prompt-textarea");
  const saveBtn = document.getElementById("btn-save-prompt");
  const restoreBtn = document.getElementById("btn-restore-prompt");
  const toast = document.getElementById("toast");
  const confirmOverlay = document.getElementById("confirm-overlay");
  const confirmCancelBtn = document.getElementById("btn-confirm-cancel");
  const confirmResetBtn = document.getElementById("btn-confirm-reset");

  let messages = [];
  let defaultPromptCache = null;
  let sending = false;

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
    messages.push({ role: "user", content: text });
    renderBubble("user", text);
    saveHistory();

    renderTyping();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: getSessionId(),
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      removeTyping();

      if (!res.ok) {
        renderBubble("system", data.error || "Não foi possível falar com a Cibele agora.");
        return;
      }

      const reply = data.reply || "";
      messages.push({ role: "assistant", content: reply });
      renderBubble("agent", reply);
      saveHistory();
    } catch (err) {
      removeTyping();
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
    renderAll();
    confirmOverlay.classList.remove("open");
    showToast("Conversa reiniciada");
  });

  openPromptBtn.addEventListener("click", async () => {
    try {
      promptTextarea.value = getCurrentPrompt() || (await fetchDefaultPrompt());
    } catch (err) {
      promptTextarea.value = "";
      showToast("Erro ao carregar o prompt: " + err.message);
    }
    promptOverlay.classList.add("open");
  });

  closePromptBtn.addEventListener("click", () => {
    promptOverlay.classList.remove("open");
  });

  promptOverlay.addEventListener("click", (e) => {
    if (e.target === promptOverlay) promptOverlay.classList.remove("open");
  });

  saveBtn.addEventListener("click", async () => {
    const value = promptTextarea.value;
    localStorage.setItem(STORAGE_PROMPT, value);
    saveBtn.disabled = true;
    saveBtn.textContent = "Publicando...";
    try {
      const res = await fetch("/api/sync-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Salvo localmente, mas falhou ao publicar no n8n");
      } else {
        promptOverlay.classList.remove("open");
        showToast("Prompt atualizado e publicado no n8n");
      }
    } catch (err) {
      showToast("Salvo localmente, mas falhou ao publicar no n8n: " + err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Salvar prompt";
    }
  });

  restoreBtn.addEventListener("click", async () => {
    try {
      const def = await fetchDefaultPrompt();
      promptTextarea.value = def;
      localStorage.setItem(STORAGE_PROMPT, def);
      showToast("Prompt padrão restaurado");
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
