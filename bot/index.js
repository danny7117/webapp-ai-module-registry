import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// ====== 測試用路由 ======
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/bot", (req, res) => {
  res.json({ message: "Bot is running!" });
});
// =======================

// ---- 環境變數設定 ----
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;      // 例如 "danny7117"
const GITHUB_REPO  = process.env.GITHUB_REPO;       // 例如 "webapp-ai-module-registry"
const CAT_WHITELIST = (process.env.CATEGORY_WHITELIST || "content,ui,data,system")
  .split(",")
  .map(s => s.trim());

function catToLabel(cat) {
  return `cat:${cat}`;
}

async function createIssue({ title, category, summary, problem, inputs, outputs, constraints }) {
  if (!CAT_WHITELIST.includes(category)) {
    throw new Error(`category "${category}" 不在白名單: ${CAT_WHITELIST.join(", ")}`);
  }

  const labels = ["module:proposal", catToLabel(category)];
  const body = [
    `**分類:** ${category}`,
    `**摘要:** ${summary || "(請補充)"}`,
    `**痛點:**\n\`\`\`json\n${JSON.stringify(problem || {}, null, 2)}\n\`\`\``,
    `**輸入:**\n\`\`\`json\n${JSON.stringify(inputs || {}, null, 2)}\n\`\`\``,
    `**輸出:**\n\`\`\`json\n${JSON.stringify(outputs || {}, null, 2)}\n\`\`\``,
    `**限制:**\n\`\`\`json\n${JSON.stringify(constraints || {}, null, 2)}\n\`\`\``,
  ].join("\n");

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`;
  await axios.post(url, { title, body, labels }, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  });
}

// ---- 接收模組提案 ----
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

const PORT = Number(process.env.PORT || 8787);
app.listen(PORT, () => console.log(`[bot] listening on :${PORT}`));
