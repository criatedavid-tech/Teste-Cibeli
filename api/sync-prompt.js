const { fetchWorkflow, getConfig, getSystemPrompt, putWorkflow } = require("./_n8n-client");
const { verifyGitHubOidc } = require("./_github-oidc");
const { getBearerToken, isAuthorized, shortHash, validatePrompt } = require("./_prompt-core");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  const allowedTokens = [process.env.PROMPT_SYNC_TOKEN, process.env.CIBELE_ADMIN_TOKEN].filter(Boolean);
  const staticAuthorization = allowedTokens.length > 0 && isAuthorized(req, allowedTokens);
  const oidcAuthorization = staticAuthorization
    ? false
    : await verifyGitHubOidc(getBearerToken(req));
  if (!staticAuthorization && !oidcAuthorization) {
    res.status(401).json({ error: "Publicação não autorizada." });
    return;
  }

  const validation = validatePrompt(req.body && req.body.systemPrompt);
  if (!validation.ok) {
    res.status(400).json({ error: "Prompt rejeitado pela validação.", details: validation.errors });
    return;
  }

  let workflow;
  let previousPrompt = "";

  try {
    const config = getConfig();
    workflow = await fetchWorkflow(config);
    previousPrompt = getSystemPrompt(workflow);
    const previousVersion = shortHash(previousPrompt);
    const nextVersion = shortHash(validation.prompt);

    if (previousVersion === nextVersion) {
      res.status(200).json({ ok: true, changed: false, version: nextVersion });
      return;
    }

    await putWorkflow(workflow, validation.prompt, config);
    const verificationWorkflow = await fetchWorkflow(config);
    const publishedPrompt = getSystemPrompt(verificationWorkflow);

    if (shortHash(publishedPrompt) !== nextVersion) {
      throw new Error("A verificação após a publicação retornou uma versão diferente.");
    }

    console.log(JSON.stringify({
      event: "prompt_published",
      workflowId: config.workflowId,
      previousVersion,
      version: nextVersion,
      source: req.headers && req.headers["x-prompt-source"] || "manual",
      at: new Date().toISOString(),
    }));

    res.status(200).json({
      ok: true,
      changed: true,
      previousVersion,
      version: nextVersion,
    });
  } catch (err) {
    if (workflow && previousPrompt) {
      try {
        await putWorkflow(workflow, previousPrompt);
        console.error(JSON.stringify({
          event: "prompt_publish_rollback",
          previousVersion: shortHash(previousPrompt),
          at: new Date().toISOString(),
        }));
      } catch (rollbackError) {
        console.error(JSON.stringify({
          event: "prompt_publish_rollback_failed",
          error: rollbackError.message,
          at: new Date().toISOString(),
        }));
      }
    }

    res.status(502).json({ error: `Falha ao publicar o prompt: ${err.message}` });
  }
};
