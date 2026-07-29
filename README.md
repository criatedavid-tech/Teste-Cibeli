# Cibele — Interface de Atendimento (CI Intercâmbio)

Interface de chat para testar o agente de IA "Cibele", da CI Intercâmbio.
Front-end estático (HTML/CSS/JS puro) + funções serverless que conversam com
um workflow n8n (que já tem a conexão com a OpenRouter do Marcelo). Pronta
para publicar na Vercel.

## Estrutura

```
index.html, style.css, script.js   -> interface do chat
api/chat.js                        -> repassa a conversa para o webhook do n8n
api/sync-prompt.js                 -> publica o prompt editado no node "AI Agent" do n8n
prompts/system-prompt-cibele.md    -> prompt padrão da Cibele (carregado no 1º acesso)
dev-server.js                      -> servidor local só para desenvolvimento
```

## Arquitetura

O workflow n8n **"CI intercâmbio - Teste de prompt"**
(`https://212n8n.criate.online/workflow/kpuav6twkR2hnZ3r`) faz o trabalho de
IA: recebe a mensagem, roda o node **AI Agent** (com o prompt da Cibele no
campo "System Message") usando o node **OpenAI Chat Model** (credencial
apontando para a OpenRouter do Marcelo), e devolve a resposta.

Esse workflow **não guarda memória de conversa entre chamadas** (rodou em
teste e o node de memória não persistia entre execuções nesse ambiente).
Por isso `api/chat.js` contorna isso: a cada mensagem, monta um "transcript"
com todo o histórico da conversa (guardado no navegador) e manda tudo junto
como `chatInput` — assim o agente sempre tem o contexto completo, mesmo sem
memória do lado do n8n.

Fluxo de uma mensagem:
1. Front-end manda `{ messages, sessionId }` para `/api/chat`.
2. `api/chat.js` monta o transcript e faz `POST` para o webhook do n8n:
   `https://212n8n.criate.online/webhook/ci-intercambio-cibele-teste`.
3. n8n roda o AI Agent e devolve `{ output: "..." }`.
4. `api/chat.js` repassa como `{ reply: "..." }` para o front-end.

## Rodando localmente

```bash
npm run dev
```

Não precisa de nenhuma variável de ambiente para conversar com a Cibele — o
webhook do n8n já está configurado como padrão em `api/chat.js`. Abra
http://localhost:3000.

Variáveis de ambiente aceitas (todas opcionais, têm um padrão já embutido):

- `N8N_WEBHOOK_URL` — URL do webhook do workflow (padrão: o link acima).
- `N8N_API_KEY` — **só necessária se você quiser usar o botão "Salvar prompt"**
  para publicar direto no n8n (usada por `api/sync-prompt.js`). Sem ela, o
  prompt continua editável e salvo no navegador, só não publica no n8n.
- `N8N_BASE_URL` / `N8N_WORKFLOW_ID` — só se o workflow mudar de lugar/ID.

⚠️ **Atenção com `N8N_API_KEY`:** essa chave dá acesso de leitura/escrita a
**todos os workflows da instância n8n** (não só o da Cibele — é uma instância
compartilhada com dezenas de outros clientes). Trate como uma credencial de
alto privilégio: configure só como env var da Vercel (nunca no código), e
considere pedir uma chave com escopo restrito a este workflow, se a
plataforma de n8n usada permitir.

## Publicando na Vercel

1. Suba este repositório no GitHub.
2. Na Vercel, "Add New Project" → importe o repositório (não precisa
   configurar build command nem output directory — é um projeto estático +
   funções serverless, a Vercel detecta sozinha).
3. Em **Settings → Environment Variables**, adicione `N8N_API_KEY` (se quiser
   o botão de publicar o prompt funcionando em produção) para os ambientes
   Production e Preview.
4. Deploy. A interface fica em `https://<seu-projeto>.vercel.app`.

## Como funciona a interface

- O prompt exibido no painel ("editar prompt") começa com o conteúdo de
  `prompts/system-prompt-cibele.md`, mas o que realmente vale durante os
  testes é o que está publicado no n8n. Editar e clicar em "Salvar prompt"
  atualiza os dois: o navegador (`localStorage`) e o node "AI Agent" no n8n.
- O histórico da conversa fica só no navegador (`localStorage`). O botão de
  reset limpa o histórico e a sessão, não o prompt.
