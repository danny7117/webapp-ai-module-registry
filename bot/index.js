// bot/index.js — module proposal with categories (ESM)
import express from "express";
import crypto from "crypto";

const app = express();
app.disable("x-powered-by");
app.use(express.json());

const PORT = Number(process.env.PORT || 8787);
const HOST = "0.0.0.0";

/* === CATEGORIES ===
   把你的四大分類填在下面這個常數，英文 key 用於路徑/標籤，label 是 GitHub 的顯示名。
   keywords 是「沒帶分類時」的自動判斷依據（可自行增刪）。
*/
const CATEGORIES = [
  { key: "ideas",        label: "category: ideas",        keywords: ["點子", "靈感", "idea", "創意"] },
  { key: "automation",   label: "category: automation",   keywords: ["自動", "workflow", "排程", "actions"] },
  { key: "frontend",     label: "category: frontend",     keywords: ["UI", "React", "Next", "前端"] },
  { key: "integration",  label: "category: integration",  keywords: ["API", "串接", "webhook", "integration"] },
];
// ↑ 若你已有固定四類，請把 key/label/keywords 換成你們的命名即可。

const CATEGORY_KEYS = new Set(CATEGORIES.map(c => c.key));
const CATEGORY_LABELS = new Map(CATEGORIES.map(c => [c.key, c.label]));

function pickCategory({ title = "", description = "", category }) {
  // 1) 指定優先：帶進來且合法就用
  if (category && CATEGORY_KEYS.has(String(category).toLowerCase())) {
    return String(category).toLowerCase();
  }
  // 2) 規則判斷：依關鍵字猜
  const text = `${title}\n${description}`.toLowerCase();
  for (const c of CATEGORIES) {
    if (c.keywords?.some(k => text.includes(k.toLowerCase()))) return c.key;
  }
  // 3) 預設丟 ideas（或改你想要的）
  return CATEGORIES[0].key;
}

function collectRoutes() {
  const routes = [];
  app._router?.stack?.forEach((layer) => {
    if (layer.route) {
      const path = layer.route.path;
      const methods = Object.keys(layer.route.methods)
        .map((m) => m.toUpperCase()).join(",");
      routes.push(`${methods} ${path}`);
    }
  });
  return routes.sort();
}
const hashKey = s => crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ghFetch(url, opts = {}, { retries = 3, backoffMs = 600, timeoutMs = 10000 } = {}) {
  for (let a = 0; a <= retries; a++) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(id);
      const retryAfter = Number(res.headers.get("retry-after") || 0) * 1000;
      const s = res.status, needRetry = (s === 429) || (s >= 500) || (s === 403 && retryAfter > 0);
      if (needRetry && a < retries) {
        const delay = Math.max(backoffMs * Math.pow(2, a), retryAfter);
        console.warn(`[github] transient ${s}, retry in ${delay}ms`);
        await sleep(delay); continue;
      }
      return res;
    } catch (e) {
      clearTimeout(id);
      if (a < retries) { const d = backoffMs * Math.pow(2, a); console.warn(`[github] error ${e}, retry ${d}ms`); await sleep(d); continue; }
      throw e;
    }
  }
}

app.use((req, _res, next) => { console.log(`[req] ${req.method} ${req.originalUrl}`); next(); });

app.get("/", (_req, res) => res.json({ ok: true, service: "bot", hint: "try /health /bot /__routes /module-proposal (POST)" }));
app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));
app.get("/bot",   (_req, res) => res.json({ message: "Bot is running!" }));

// POST /module-proposal
// Body: { title, description, category?, labels?, assignees?, milestone? }
app.post("/module-proposal", async (req, res) => {
  try {
    const { title, description, category, labels = ["module-proposal"], assignees = [], milestone } = req.body || {};
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ ok: false, error: "Missing title" });
    }
    const desc = (description ?? "").toString();

    const token = process.env.GITHUB_TOKEN;
    const [owner, repo] = (process.env.GITHUB_REPO || "").split("/");
    if (!token || !owner || !repo) {
      return res.status(500).json({ ok: false, error: "Missing GITHUB_TOKEN or GITHUB_REPO (expected owner/repo)" });
    }

    // 分類（允許用戶指定，否則自動判斷）
    const picked = pickCategory({ title, description: desc, category });
    const categoryLabel = CATEGORY_LABELS.get(picked) || `category: ${picked}`;

    // 去重
    const normalized = `${title.trim().toLowerCase()}|${desc.trim().toLowerCase()}|${picked}`;
    const dedupe = hashKey(normalized);
    const dedupeFooter = `\n\n<!-- module-proposal-dedupe:${dedupe} -->`;

    // 查重（抓前 100 個開啟中的 module-proposal）
    const q = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=${encodeURIComponent(["module-proposal", categoryLabel].join(","))}&per_page=100`;
    const listRes = await ghFetch(q, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "module-bot" } }, { retries: 2, backoffMs: 500, timeoutMs: 8000 });
    const list = listRes.ok ? await listRes.json() : [];
    const dup = Array.isArray(list) ? list.find(i => typeof i?.body === "string" && i.body.includes(dedupeFooter)) : null;
    if (dup?.number) {
      return res.json({ ok: true, deduped: true, category: picked, issue_number: dup.number, issue_url: dup.html_url });
    }

    // 建 Issue（自動附上分類標籤）
    const body =
      (desc?.trim()?.length ? desc.trim() : "(no description)") +
      `\n\n---\n**meta**\n- category: ${picked}\n- created via /module-proposal\n- dedupe: ${dedupe}\n${dedupeFooter}`;

    const createRes = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "module-bot",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          body,
          labels: Array.from(new Set([ ...labels, categoryLabel ])),
          assignees, milestone,
        }),
      },
      { retries: 3, backoffMs: 800, timeoutMs: 12000 }
    );

    const data = await createRes.json();
    if (!createRes.ok || !data?.number) {
      console.error("[github] create issue failed:", createRes.status, data);
      return res.status(502).json({ ok: false, error: "GitHub issue creation failed", status: createRes.status, detail: data });
    }

    return res.json({ ok: true, category: picked, issue_number: data.number, issue_url: data.html_url, dedupe });
  } catch (e) {
    console.error("[/module-proposal] error:", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/__routes", (_req, res) => res.json({ routes: collectRoutes() }));

app.use((req, res) => res.status(404).json({ ok:false, error:"Route not found", method:req.method, path:req.originalUrl, knownRoutes: collectRoutes() }));

app.listen(PORT, HOST, () => {
  const filePath = (() => { try { return new URL(import.meta.url).pathname; } catch { return "unknown"; }})();
  console.log(`[bot] file         : ${filePath}`);
  console.log(`[bot] listening on : http://${HOST}:${PORT}`);
  console.log(`[bot] routes ->`, collectRoutes());
});
