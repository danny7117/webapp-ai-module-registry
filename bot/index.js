// bot/index.js
import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// --- 這三個值從 .env 來（本機 .env，不要 commit） ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;      // 你的 PAT
const GITHUB_OWNER = process.env.GITHUB_OWNER;      // 你的 GitHub 使用者
const GITHUB_REPO  = process.env.GITHUB_REPO;       // 你的 repo 名稱
const CAT_WHITELIST =
  (process.env.CATEGORY_WHITELIST || "content,ui,data,system")
    .split(",")
    .map(s => s.trim());

// ===== 健康檢查與基本確認 =====
app.get("/health", (req, res) => {
  // 看到這行 JSON 代表 /health 路由已經存在
  res.json({ status: "ok" });
});

app.get("/bot", (req, res) => {
  res.json({ message: "Bot is running!" });
});

// ===== 內部小工具 =====
function catToLabel(cat) {
  return `cat:${cat}`;
}

async function createIssue({ title, category, summary, problem, inputs, outputs, constraints }) {
  if (!CAT_WHITELIST.includes(category)) {
    throw new Error(`category "${category}" 不在白名單: ${CAT_WHITELIST.join(", ")}`);
  }

  const labels = ["module:proposal", catToLabel(category)];

  const body = [
    `**分類**：${category}`,
    `**摘要**：${summary || "(請補充)"}`,
    `**待解問題**：\n${problem || "(請描述)"}\n`,
    `**輸入**：\n${JSON.stringify(inputs || {}, null, 2)}`,
    `**輸出**：\n${JSON.stringify(outputs || {}, null, 2)}`,
    `**限制**：\n${JSON.stringify(constraints || {}, null, 2)}`
  ].join("\n\n");

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`;
  await axios.post(
    url,
    { title, body, labels },
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
}

// ===== 對外 API：新模組提案 =====
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
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

// ===== 啟動伺服器 =====
const PORT = Number(process.env.PORT || 8787);
// === 1) 顯示目前註冊的路由（啟動時印在 CMD）===
function listRoutes(app) {
  const routes = [];
  app._router?.stack?.forEach(l => {
    if (l.route) {
      const methods = Object.keys(l.route.methods).join(",").toUpperCase();
      routes.push({ methods, path: l.route.path });
    }
  });
  console.table(routes);
}
listRoutes(app);

// === 2) 臨時偵錯 endpoint：告訴我現在跑的是誰 ===
app.get("/__whoami", (req, res) => {
  res.json({
    cwd: process.cwd(),      // 目前工作目錄
    file: import.meta.url,   // 這支檔案的完整路徑（URL 形式）
    ts: Date.now()
  });
});

app.listen(PORT, () => console.log(`[bot] listening on :${PORT}`));
