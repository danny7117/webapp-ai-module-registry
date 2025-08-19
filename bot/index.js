cd /d C:\webapp-ai-module-registry
powershell -Command "$code=@'
// bot/index.js — minimal + prints file path & routes (for sure)
import express from \"express\";

const app = express();
app.disable(\"x-powered-by\");
app.use(express.json());

const PORT = Number(process.env.PORT || 8787);
const HOST = \"0.0.0.0\";

function collectRoutes() {
  const routes = [];
  app._router?.stack?.forEach((layer) => {
    if (layer.route) {
      const path = layer.route.path;
      const methods = Object.keys(layer.route.methods)
        .map((m) => m.toUpperCase())
        .join(\",\");
      routes.push(`${methods} ${path}`);
    }
  });
  return routes.sort();
}

// simple request log
app.use((req, _res, next) => { console.log(`[req] ${req.method} ${req.originalUrl}`); next(); });

// root
app.get(\"/\", (_req, res) => res.json({ ok: true, service: \"bot\", hint: \"try /health or /bot\" }));

// health
app.get(\"/health\", (_req, res) => res.json({ status: \"ok\", ts: Date.now() }));

// bot
app.get(\"/bot\", (_req, res) => res.json({ message: \"Bot is running!\" }));

// placeholder biz API
app.post(\"/module-proposal\", (req, res) => res.json({ ok: true, received: req.body ?? null }));

// routes list
app.get(\"/__routes\", (_req, res) => res.json({ routes: collectRoutes() }));

// 404 JSON
app.use((req, res) => res.status(404).json({ ok:false, error:\"Route not found\", method:req.method, path:req.originalUrl, knownRoutes: collectRoutes() }));

app.listen(PORT, HOST, () => {
  const filePath = (() => { try { return new URL(import.meta.url).pathname; } catch { return \"unknown\"; }})();
  console.log(`[bot] file         : ${filePath}`);
  console.log(`[bot] listening on : http://${HOST}:${PORT}`);
  console.log(`[bot] routes ->`, collectRoutes());
});
'@; New-Item -ItemType Directory -Path bot -Force | Out-Null; Set-Content -Path bot/index.js -Value $code -Encoding utf8"
