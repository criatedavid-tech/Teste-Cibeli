# Arquitetura e histórico técnico — Cibele (CI Intercâmbio)

> Este documento registra como o sistema foi montado, as decisões tomadas e os
> problemas encontrados/resolvidos no caminho. Serve de referência para quem
> for mexer no projeto depois (inclusive uma versão futura de mim mesma).

## 1. Visão geral

```
┌──────────────┐      POST /api/chat       ┌───────────────────┐      POST webhook      ┌──────────────────┐
│  index.html  │  ────────────────────▶   │  Vercel Functions   │  ──────────────────▶  │  n8n workflow     │
│  (navegador) │                           │  api/chat.js        │                        │  "CI intercâmbio  │
│              │  ◀────────────────────   │  api/sync-prompt.js │  ◀──────────────────  │   - Teste de      │
└──────────────┘      { reply }            └───────────────────┘      { output }         │   prompt"         │
                                                                                           │  (AI Agent + LLM  │
                                                                                           │  via OpenRouter)  │
                                                                                           └──────────────────┘
```

- **Front-end** (`index.html`/`style.css`/`script.js`): interface de chat,
  painel de edição do prompt, botão de reset. HTML/CSS/JS puro, sem build.
- **`api/chat.js`** (função serverless): recebe a conversa do navegador,
  monta o histórico num "transcript" de texto e repassa pro webhook do n8n.
- **`api/sync-prompt.js`** (função serverless): publica o prompt editado no
  painel direto no node "AI Agent" do workflow n8n, via API do n8n.
- **Workflow n8n**: quem de fato roda a IA. Recebe `{ chatInput, sessionId }`
  e devolve `{ output: "..." }`. A conexão com o modelo de linguagem
  (OpenRouter, credencial do Marcelo) já estava pronta quando recebemos o
  workflow — nosso trabalho foi ajustar esse fluxo para expor um endpoint
  utilizável e injetar o prompt da Cibele nele.

## 2. Como o prompt foi criado (Etapa 1)

O prompt em `prompts/system-prompt-cibele.md` foi montado a partir da análise
completa do repositório `cigoiania/Cibele` (base de conhecimento comercial da
CI Intercâmbio — produtos, personas de lead, funil de qualificação, modelos
de mensagem A–L aprovados, regras de ancoragem de investimento, pontos que
escalam para humano etc.), usando a skill interna `criador-prompt-atendimento`
como estrutura de montagem (persona, missão, regras de ouro, base de
conhecimento, objeções, exemplos de diálogo).

**Uma exceção deliberada** ao padrão dessa skill: ela normalmente proíbe
qualquer emoji. Como a CI Intercâmbio já tinha aprovado formalmente o uso
moderado de emoji (máximo 2 no início da conversa, coração sempre na cor
laranja da marca 🧡), o prompt final mantém essa regra específica do cliente
em vez do padrão genérico da skill.

A seção final do prompt (`# CONTEXTO DA CONVERSA`, com variáveis tipo
`{{nome_cliente}}`) foi pensada para uma integração que chamasse a IA
diretamente (sem n8n). Ao migrar para o n8n, essa seção foi removida da cópia
publicada no workflow, porque o n8n resolve entrada/contexto de outro jeito
(ver seção 4).

## 3. O workflow n8n

- **Nome:** "CI intercâmbio - Teste de prompt"
- **ID:** `kpuav6twkR2hnZ3r`
- **Instância:** `212n8n.criate.online` — uma instância **compartilhada**,
  usada por dezenas de clientes de uma agência de automação (conta
  "Murilo Guimaraes"). Não é uma instância exclusiva da CI Intercâmbio.
- **Nodes (estado atual):**
  1. `When chat message received` (`@n8n/n8n-nodes-langchain.chatTrigger`) —
     ficou no fluxo, mas não é o caminho usado pela nossa interface (ver
     seção 4.1). Serve pra testar o prompt direto no painel de chat do
     próprio editor n8n, se alguém quiser.
  2. `Webhook` (`n8n-nodes-base.webhook`) — **é o node que a nossa interface
     chama.** Método POST, path `ci-intercambio-cibele-teste`, responseMode
     `lastNode` (devolve a saída do último node executado como resposta
     HTTP).
  3. `AI Agent` (`@n8n/n8n-nodes-langchain.agent`) — tem o prompt da Cibele
     no campo "System Message" (`parameters.options.systemMessage`) e o
     texto de entrada configurado explicitamente como
     `={{ $json.chatInput || $json.body?.chatInput }}` (compatível com os
     dois triggers acima).
  4. `OpenAI Chat Model` (`@n8n/n8n-nodes-langchain.lmChatOpenAi`) — modelo
     `gpt-4o`, credencial "OpenAI account" (na prática apontando pra
     OpenRouter, já configurada pelo Marcelo). Não foi mexida.
- **Webhook público final:**
  `https://212n8n.criate.online/webhook/ci-intercambio-cibele-teste`

## 4. Problemas encontrados e como foram resolvidos

### 4.1 O webhook do Chat Trigger não registrava

O node `chatTrigger` original tem uma opção "Make Chat Publicly Available"
(`public`, desligada por padrão) que controla se ele expõe um webhook de
produção. Mesmo depois de ligar essa opção e reativar o workflow várias vezes
via API, o webhook continuava respondendo `404 not registered` — só o painel
de chat interno do editor n8n conseguia falar com ele. Isso parece ser uma
particularidade dessa instância (não temos acesso à UI/login pra confirmar
via toggle manual, só à API).

**Solução:** adicionamos um segundo trigger, um node `Webhook` padrão
(`n8n-nodes-base.webhook`), que registra webhooks normalmente via API nessa
mesma instância (confirmado — é o padrão usado pelos outros ~100 workflows
ativos dela). Esse é o node que a nossa interface chama.

### 4.2 A memória de conversa não persistia

Adicionamos um node `Simple Memory` (`memoryBufferWindow`, com sessão
identificada pelo `sessionId`) para o Agent lembrar o histórico entre
mensagens. Ao testar (mesma sessão, duas mensagens seguidas), o node sempre
carregava `chatHistory: []` vazio — ou seja, não guardava nada de uma chamada
pra outra. A hipótese mais provável é que essa instância roda com múltiplos
processos/workers, e a memória em processo (não é um banco de dados, é só um
objeto em memória) não é compartilhada entre eles.

**Solução:** removemos o node de memória do workflow. Em vez disso, o
histórico da conversa é responsabilidade do **nosso app**: o navegador guarda
todas as mensagens (`localStorage`), e a cada envio, `api/chat.js` monta um
transcript com todo o histórico anterior e manda tudo dentro do campo
`chatInput`, por exemplo:

```
Cliente: meu nome e Fernanda
Cibele: Oi, Fernanda! Como posso te ajudar?
Cliente: qual e o meu nome mesmo?
```

Isso foi testado e confirmado funcionando (a Cibele lembrou corretamente um
nome mencionado duas mensagens antes).

**Limitação importante:** esse truque de memória só existe **na nossa
interface**. Se esse mesmo workflow n8n for reaproveitado por outro canal
(WhatsApp direto, por exemplo, sem passar pelo nosso `api/chat.js`), esse
canal não vai ter histórico de conversa — precisaria de uma memória de
verdade ligada ao n8n (ex.: um node de memória com Postgres ou Redis, que
persiste de fato entre chamadas e workers).

## 5. Publicando o prompt (botão "Salvar prompt")

`api/sync-prompt.js` recebe o texto editado no painel e:
1. Busca o workflow atual via `GET /api/v1/workflows/{id}` na API do n8n.
2. Substitui `parameters.options.systemMessage` do node `AI Agent`.
3. Salva de volta via `PUT /api/v1/workflows/{id}`.

Isso significa que salvar o prompt pela interface **afeta imediatamente**
qualquer pessoa testando o mesmo workflow (inclusive pelo painel de chat
interno do n8n, seção 4.1). Não existe versionamento automático dessa
publicação — a única cópia "oficial" versionada em git é
`prompts/system-prompt-cibele.md`; se editar e salvar pela interface, vale a
pena trazer a mudança de volta pra esse arquivo manualmente quando for boa.

## 6. Segurança

A `N8N_API_KEY` usada por `api/sync-prompt.js` dá acesso de leitura/escrita a
**todos os workflows da instância `212n8n.criate.online`** — não só ao da
Cibele. É uma instância compartilhada com dezenas de outros clientes da
agência. Tratar essa chave como credencial de alto privilégio:
- Nunca no código-fonte, só como variável de ambiente (local: `.env.local`,
  que está no `.gitignore`; produção: env var da Vercel).
- Se a plataforma de n8n permitir gerar uma chave com escopo restrito a este
  workflow específico, vale considerar trocar por uma assim que possível.

## 7. Limitações conhecidas / próximos passos possíveis

- Sem memória persistente de verdade do lado do n8n (ver 4.2) — funciona hoje
  porque nossa interface carrega o histórico, mas não escala pra outros
  canais sem mudança no workflow.
- Sem versionamento automático entre o prompt publicado no n8n e o arquivo
  `.md` do repositório — a sincronização hoje é manual.
- O node `chatTrigger` original ficou no workflow sem uso pela nossa
  interface (só serve pro teste manual dentro do editor n8n); pode ser
  removido se quiserem simplificar o fluxo.
- Conteúdo do prompt ainda carrega as pendências conhecidas da base de
  conhecimento da CI (faixa de valores de Cursos de idioma, escopo turismo,
  significado de status do CRM) — o prompt trata isso como "não confirmo,
  vou verificar com o consultor", mas assim que esses dados existirem, vale
  atualizar o `.md` e republicar.
