// bot/index.js — minimal, with debug
import express from "express";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 8787);
const HOST = "0.0.0.0";

// ===== Debug: 啟動時印出目前檔案與所有註冊路由 =====
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
  return routes;
}

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
  res.json({ ok: true });
});

// 列出目前註冊的路由（除錯用）
app.get("/__routes", (req, res) => {
  res.json({ routes: collectRoutes() });
});

app.listen(PORT, HOST, () => {
  const routes = collectRoutes();
  console.log(`[bot] listening on : http://${HOST}:${PORT}`);
  console.log(`[bot] routes ->`, routes);
});
