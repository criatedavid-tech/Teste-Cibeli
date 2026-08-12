// Servidor local só para desenvolvimento/preview (não é usado na Vercel —
// lá, cada arquivo em /api roda como função serverless nativa).
const http = require("http");
const fs = require("fs");
const path = require("path");

// Carrega .env.local (se existir) sem depender de pacotes externos.
const envFile = path.join(__dirname, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2] ? match[2].replace(/^["']|["']$/g, "") : "";
    }
  }
}

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serveStatic(req, res) {
  const urlPath = req.url.split("?")[0];
  const filePath = path.join(ROOT, urlPath === "/" ? "/index.html" : urlPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Não encontrado: " + urlPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function attachVercelShim(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };
  res.json = function json(obj) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
  };
  return res;
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  if (urlPath.startsWith("/api/")) {
    const apiFile = path.join(ROOT, "api", urlPath.slice(5) + ".js");
    if (!fs.existsSync(apiFile)) {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Rota não encontrada: " + urlPath }));
      return;
    }
    delete require.cache[require.resolve(apiFile)];
    const handler = require(apiFile);
    attachVercelShim(res);

    if (req.method === "GET") {
      Promise.resolve(handler(req, res)).catch((err) => {
        if (!res.writableEnded) res.status(500).json({ error: "Erro interno: " + err.message });
      });
      return;
    }

    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", async () => {
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = {};
      }
      try {
        await handler(req, res);
      } catch (err) {
        res.status(500).json({ error: "Erro interno: " + err.message });
      }
    });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Cibele (dev) rodando em http://localhost:${PORT}`);
});
