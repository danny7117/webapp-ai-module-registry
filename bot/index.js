// bot/index.js
import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// --- 讀環境變數（優先本機 .env，Actions 不要 commit）---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;             // 你的 PAT
const GITHUB_OWNER = process.env.GITHUB_OWNER;             // 例如 "danny7117"
const GITHUB_REPO  = process.env.GITHUB_REPO;              // 例如 "webapp-ai-module-registry"
const CAT_WHITELIST = (process.env.CATEGORY_WHITELIST || "content,ui,data,system")
  .split(",")
  .map(s => s.trim());

function catToLabel(cat) {
  // 轉成你在 GitHub 建好的分類標籤：cat:content / cat:ui / cat:data / cat:system
  return `cat:${cat}`;
}

async function createIssue({ title, category, summary, problem, inputs, outputs, constraints }) {
  if (!CAT_WHITELIST.includes(category)) {
    throw new Error(`category "${category}" 不在白名單：${CAT_WHITELIST.join(", ")}`);
  }

  const labels = ["module:proposal", catToLabel(category)];

  const body = [
    `**分類**：${category}`,
    summary ? `**摘要**：\n${summary}` : "",
    problem ? `**要解決的問題**：\n${problem}` : "",
    inputs  ? `**輸入**：\n\`\`\`json\n${JSON.stringify(inputs,  null, 2)}\n\`\`\``  : "",
    outputs ? `**輸出**：\n\`\`\`json\n${JSON.stringify(outputs, null, 2)}\n\`\`\``  : "",
    constraints ? `**限制/條件**：\n${constraints}` : "",
  ].filter(Boolean).join("\n\n");

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`;

  await axios.post(
    url,
    { title, body, labels },
    { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } }
  );
}

// ---- 診斷用：健康檢查 ----
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ---- 診斷用：確認 bot 有在跑 ----
app.get("/bot", (_req, res) => {
  res.json({ message: "Bot is running!" });
});

// ---- 提供 HTTP 端點，讓中介/第三方丟入新的模組提案 ----
app.post("/module-proposal", async (req, res) => {
  try {
    const payload = req.body || {};
    const { title, category } = payload;
    if (!title || !category) {
      return res.status(400).json({ ok: false, error: "title & category 為必填" });
    }

    await createIssue(payload);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => console.log(`[bot] listening on :${PORT}`));
