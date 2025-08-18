import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// --- 環境變數 (建議放在本地 .env 或 repo 設定，不要 commit) ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;             // 你的 PAT
const GITHUB_OWNER = process.env.GITHUB_OWNER;             // 例如 "danny7117"
const GITHUB_REPO  = process.env.GITHUB_REPO;              // 例如 "webapp-ai-module-registry"
const CAT_WHITELIST = (process.env.CATEGORY_WHITELIST || "content,ui,data,system")
  .split(",")
  .map(s => s.trim());

// --- 工具函數 ---
function catToLabel(cat) {
  return `cat:${cat}`;
}

async function createIssue(title, category, summary, problem, inputs, outputs, constraints) {
  if (!CAT_WHITELIST.includes(category)) {
    throw new Error(`category "${category}" 不在白名單: ${CAT_WHITELIST.join(", ")}`);
  }

  const labels = ["module:proposal", catToLabel(category)];
  const body = [
    `**分類:** ${category}`,
    `**摘要:** ${summary || "(請補充)"}`,
    `**問題:**\n${problem || "(請補充)"}`,
    `**輸入:**\n${JSON.stringify(inputs || {}, null, 2)}`,
    `**輸出:**\n${JSON.stringify(outputs || {}, null, 2)}`,
    `**限制條件:**\n${constraints || "(可留空)"}`
  ].join("\n");

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`;
  await axios.post(url, { title, body, labels }, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json"
    }
  });
}

// --- API 路由 ---
// 模組提案 (POST)
app.post("/module-proposal", async (req, res) => {
  try {
    const payload = req.body || {};
    const { title, category } = payload;

    if (!title || !category) {
      return res.status(400).json({ ok: false, error: "title & category 為必填" });
    }

    await createIssue(
      title,
      category,
      payload.summary,
      payload.problem,
      payload.inputs,
      payload.outputs,
      payload.constraints
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// 健康檢查 (GET)
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Bot 狀態 (GET)
app.get("/bot", (req, res) => {
  res.json({ message: "Bot is running!" });
});

// --- 啟動服務 ---
const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => console.log(`[bot] listening on :${PORT}`));
