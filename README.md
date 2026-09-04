# Cibele — Interface de Atendimento (CI Intercâmbio)

Interface de chat para testar o agente de IA "Cibele", da CI Intercâmbio.
Front-end estático (HTML/CSS/JS puro) + funções serverless que conversam com
um workflow n8n (que já tem a conexão com a OpenRouter do Marcelo). Pronta
para publicar na Vercel.

## Estrutura

```
index.html, style.css, script.js   -> interface do chat
api/chat.js                        -> repassa a conversa para o webhook do n8n
api/prompt.js                      -> consulta o prompt realmente ativo no n8n
api/sync-prompt.js                 -> publica, verifica e faz rollback do prompt no n8n
api/save-conversation.js           -> salva testes fictícios no repositório de treinamento
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

Para manter o consumo previsível, o aplicativo envia no máximo as 12 mensagens
anteriores e 6.000 caracteres de histórico. Se o provedor sinalizar um limite
temporário, a interface respeita o tempo recomendado e tenta novamente uma vez,
sem duplicar a mensagem do usuário no histórico.

## Rodando localmente

```bash
npm run dev
```

Não precisa de nenhuma variável de ambiente para conversar com a Cibele — o
webhook do n8n já está configurado como padrão em `api/chat.js`. Abra
http://localhost:3000.

Variáveis de ambiente:

- `N8N_WEBHOOK_URL` — URL do webhook do workflow (padrão: o link acima).
- `N8N_API_KEY` — necessária para consultar e publicar o prompt no n8n.
- `N8N_BASE_URL` / `N8N_WORKFLOW_ID` — só se o workflow mudar de lugar/ID.
- `PROMPT_SYNC_TOKEN` — opcional, mantido apenas como acesso administrativo de
  contingência. A automação normal usa a identidade temporária do GitHub
  Actions e não depende de secret compartilhado.
- `CIBELE_GITHUB_APP_ID` — identificador público da GitHub App.
- `CIBELE_GITHUB_INSTALLATION_ID` — instalação restrita ao repositório
  `cigoiania/Cibele`.
- `CIBELE_GITHUB_PRIVATE_KEY` — chave privada PEM da GitHub App. Deve existir
  somente na Vercel e nunca no navegador, no GitHub ou em conversas.

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
3. Em **Settings → Environment Variables**, configure os segredos descritos
   acima. Nunca coloque os valores no repositório nem no JavaScript do
   navegador.
4. Deploy. A interface fica em `https://<seu-projeto>.vercel.app`.

## Como funciona a interface

- O painel consulta `api/prompt.js` e mostra a versão realmente publicada no
  n8n. O arquivo local é apenas contingência quando o n8n está indisponível.
- O prompt oficial fica em `cigoiania/Cibele/prompt/system-prompt-cibele.md`.
  Uma alteração aprovada na branch oficial aciona o GitHub Actions, que chama
  `api/sync-prompt.js` usando autenticação Bearer.
- O botão de salvar conversa exibe um aviso de repositório público e registra
  diretamente somente testes fictícios em `conversas/pendentes/`, sem login ou
  chave no navegador. A API continua limitada ao repositório, branch, pasta e
  formato oficiais. Não salvar dados pessoais ou confidenciais.
- O histórico da conversa fica só no navegador (`localStorage`). O botão de
  reset limpa o histórico e a sessão, não o prompt.

## Ordem de ativação da automação

1. Publicar primeiro esta versão da aplicação na Vercel.
2. Enviar o workflow e a pasta `prompt/` para a branch oficial.
3. Opcionalmente criar a variável de Actions `PROMPT_SYNC_URL`; sem ela, o
   workflow usa `https://cibele-atendimento.vercel.app/api/sync-prompt`.
4. A automação obtém uma identidade OIDC temporária do GitHub; nenhum secret
   precisa ser compartilhado com o Claude Code.

## Segurança e rollback

- A API recusa prompts vazios, pequenos demais ou sem seções/regras críticas.
- Depois do `PUT`, a versão é buscada novamente no n8n e comparada pelo hash.
- Se a verificação falhar, a API tenta republicar imediatamente a versão
  anterior.
- Logs registram versões e eventos, nunca o conteúdo do prompt nem segredos.
- Para rollback operacional, reverta o commit do prompt no repositório de
  treinamento; a versão restaurada será republicada.
- A chave privada da GitHub App fica somente na Vercel. A cada salvamento, o
  servidor obtém um token temporário limitado ao repositório `Cibele`; o código
  também bloqueia qualquer caminho fora de `conversas/pendentes/`.
