// bot/index.js — minimal, with extra debug + 404 JSON
import express from "express";

const app = express();
app.disable("x-powered-by");
app.use(express.json());

// 若在容器/VM/雲端跑，顯式綁定 0.0.0.0，避免只綁到 localhost
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";

// ===== 簡易請求日誌（確認請求是否打進來、實際路徑與方法）=====
app.use((req, res, next) => {
  console.log(`[req] ${req.method} ${req.originalUrl}`);
  next();
});

// ===== Debug: 列出目前所有註冊路由 =====
function collectRoutes() {
  const routes = [];
  app._router?.stack?.forEach((layer) => {
    if (layer.route) {
      const path = layer.route.path;
      const methods = Object.keys(layer.route.methods)
        .map((m) => m.toUpperCase())
        .join(",");
      routes.push(`${methods} ${path}`);
    }
  });
  return routes.sort();
}

// 根路徑（避免你 curl / 時看到 Cannot GET）
app.get("/", (req, res) => {
  res.json({ ok: true, service: "bot", hint: "try /health or /bot" });
});

// 健康檢查
app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

// 簡易 bot 檢查
app.get("/bot", (req, res) => {
  res.json({ message: "Bot is running!" });
});

// 你之後要接的業務 API（先回固定 OK，之後再填內容）
app.post("/module-proposal", async (req, res) => {
  // TODO: 實作建立 GitHub issue
  res.json({ ok: true, received: req.body ?? null });
});

// 列出目前註冊的路由（除錯用）
app.get("/__routes", (req, res) => {
  res.json({ routes: collectRoutes() });
});

// 404 handler（避免 Express 預設的 'Cannot GET /xxx'）
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
    method: req.method,
    path: req.originalUrl,
    knownRoutes: collectRoutes(),
  });
});

app.listen(PORT, HOST, () => {
  const routes = collectRoutes();
  const filePath = (() => {
    try {
      return new URL(import.meta.url).pathname;
    } catch {
      return "unknown (CJS?)";
    }
  })();

  console.log(`[bot] file         : ${filePath}`);
  console.log(`[bot] listening on : http://${HOST}:${PORT}`);
  console.log(`[bot] routes ->`, routes);
});
