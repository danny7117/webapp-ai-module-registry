// bot/index.js －最小可測版

import express from "express";
import axios from "axios";
import { fileURLToPath } from "url";
import path from "path";

// 顯示現在到底跑哪份檔案
const __filename = fileURLToPath(import.meta.url);
console.log(`[boot] cwd=${process.cwd()} file=${__filename}`);

const app = express();
app.use(express.json());

// 健康檢查（用來確認路由有掛上）
app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

// 簡單 bot 測試
app.get("/bot", (req, res) => {
  res.json({ message: "Bot is running!" });
});

// ------- 以下先保留你之後要用的新增模組 API（可先不打）-------
app.post("/module-proposal", async (req, res) => {
  try {
    // 先回傳成功，之後你要打 GitHub API 再補
    res.json({ ok: true, echo: req.body || {} });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// 監聽埠
const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => console.log(`[bot] listening on :${PORT}`));
