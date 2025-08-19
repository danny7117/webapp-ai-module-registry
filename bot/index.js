// bot/index.js — uses built-in fetch (Node 18+) & creates real GitHub issues
import express from "express";
import crypto from "crypto";

const app = express();
app.disable("x-powered-by");
app.use(express.json());

const PORT = Number(process.env.PORT || 8787);
const HOST = "0.0.0.0";

// 固定四大分類
const ALLOWED_CATEGORIES = new Set(["frontend", "integration", "ai", "utility"]);
const CAT_LABEL = (c) => `category: ${c}`;

function collectRoutes() {
  const routes = [];
  app._router?.stack?.forEach((layer) => {
    if (layer.route) {
      const path = layer.route.path;
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase()).join(",");
      routes.push(`${methods} ${path}`);
    }
  });
  return routes.sort();
}

const hash16 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ghFetch(url, opts = {}, { retries = 2, backoffMs = 600, timeoutMs = 10000 } = {}) {
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(t);

      const retryAfter = Number(res.headers.get("retry-after") || 0) * 1000;
      const s = res.status;
      const retryable = s === 429 || s >= 500 || (s === 403 && retryAfter > 0);
      if (retryable && i < retries) {
        await sleep(Math.max(backoffMs * 2 ** i, retryAfter));
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      if (i < retries) {
        await sleep(backoffMs * 2 ** i);
        continue;
      }
      throw e;
    }
  }
}

function validate(body) {
  const errors = [];
  const title = String(body?.title || "").trim();
  const description = String(body?.description || "").trim();
  const category = String(body?.category || "").trim().toLowerCase();

  if (!title || !title.toLowerCase().startsWith("module:")) errors.push("title 必須以 `module: {名稱}` 開頭");
  if (!ALLOWED_CATEGORIES.has(category)) errors.push("category 必須是 frontend|integration|ai|utility 其一");

  const spec = body?.spec;
  if (!spec || typeof spec !== "object") errors.push("spec 必須存在且為物件");
  else {
    const ins = Array.isArray(spec.inputs) ? spec.inputs : [];
    const outs = Array.isArray(spec.outputs) ? spec.outputs : [];
    if (ins.length === 0) errors.push("spec.inputs 至少 1 筆");
    if (outs.length === 0) errors.push("spec.outputs 至少 1 筆");
    const badIn = ins.find(i => !i?.name || !i?.type || !i?.desc);
    const badOut = outs.find(o => !o?.name || !o?.type || !o?.desc);
    if (badIn) errors.push("spec.inputs 每筆需含 name/type/desc");
    if (badOut) errors.push("spec.outputs 每筆需含 name/type/desc");
  }

  const acceptance = Array.isArray(body?.acceptance) ? body.acceptance : [];
  if (acceptance.length === 0) errors.push("acceptance 至少 1 筆");

  const example = body?.example;
  if (!example || typeof example !== "object") errors.push("example 必須存在（I/O 範例或最小程式）");

  return { ok: errors.length === 0, errors, title, description, category };
}

// ====== 基本路由 ======
app.use((req, _res, next) => { console.log(`[req] ${req.method} ${req.originalUrl}`); next(); });
app.get("/", (_req, res) => res.json({ ok: true, service: "bot", hint: "try /health /bot /__routes /module-proposal (POST)" }));
app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));
app.get("/bot", (_req, res) => res.json({ message: "Bot is running!" }));
app.get("/__routes", (_req, res) => res.json({ routes: collectRoutes() }));

// ====== 提案：建立 GitHub Issue ======
app.post("/module-proposal", async (req, res) => {
  try {
    // 驗證 payload
    const v = validate(req.body || {});
    if (!v.ok) return res.status(400).json({ ok: false, reason: "invalid_payload", errors: v.errors });

    // 讀取環境參數
    const token = process.env.GITHUB_TOKEN;
    const [owner, repo] = (process.env.GITHUB_REPO || "").split("/");
    if (!token || !owner || !repo) {
      return res.status(500).json({ ok: false, error: "Missing GITHUB_TOKEN 或 GITHUB_REPO（需為 owner/repo）" });
    }

    // 去重：同 title+category
    const dedupe = hash16(`${v.title.toLowerCase()}|${v.category}`);
    const dedupeFooter = `\n\n<!-- module-proposal-dedupe:${dedupe} -->`;

    // 查重：找已存在的同類別 ready 的開啟 Issue
    const catLabel = CAT_LABEL(v.category);
    const listUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=${encodeURIComponent(`module:proposal,module-ready,${catLabel}`)}&per_page=100`;
    const listRes = await ghFetch(listUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "module-bot" }
    });
    const list = listRes.ok ? await listRes.json() : [];
    const dup = Array.isArray(list) ? list.find(i => typeof i?.body === "string" && i.body.includes(dedupeFooter)) : null;
    if (dup?.number) {
      return res.json({ ok: true, deduped: true, category: v.category, issue_number: dup.number, issue_url: dup.html_url });
    }

    // 組 Issue 內容
    const body =
`## module spec
- category: ${v.category}

### description
${v.description || "(no description)"}

### inputs
${(req.body.spec.inputs || []).map(i => `- ${i.name} (${i.type}) - ${i.desc}`).join("\n")}

### outputs
${(req.body.spec.outputs || []).map(o => `- ${o.name} (${o.type}) - ${o.desc}`).join("\n")}

### acceptance
${(req.body.acceptance || []).map((a, i) => `${i + 1}. ${a}`).join("\n")}

### example
\`\`\`json
${JSON.stringify(req.body.example, null, 2)}
\`\`\`

---
- created via /module-proposal
- dedupe: ${dedupe}
${dedupeFooter}`;

    const labels = Array.from(new Set(["module:proposal", "module-ready", catLabel, ...(req.body?.labels || [])]));

    // 建立 Issue
    const createRes = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "module-bot",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: v.title.trim(),
        body,
        labels,
        assignees: req.body?.assignees || [],
        milestone: req.body?.milestone
      })
    }, { retries: 3, backoffMs: 800, timeoutMs: 12000 });

    const data = await createRes.json();
    if (!createRes.ok || !data?.number) {
      console.error("[github] create issue failed:", createRes.status, data);
      return res.status(502).json({ ok: false, error: "GitHub issue creation failed", status: createRes.status, detail: data });
    }

    return res.json({ ok: true, category: v.category, issue_number: data.number, issue_url: data.html_url, dedupe });
  } catch (e) {
    console.error("[/module-proposal] error:", e);
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// 統一的 JSON 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found", method: req.method, path: req.originalUrl, knownRoutes: collectRoutes() });
});

app.listen(PORT, HOST, () => {
  const filePath = (() => { try { return new URL(import.meta.url).pathname; } catch { return "unknown"; }})();
  console.log(`[bot] file         : ${filePath}`);
  console.log(`[bot] listening on : http://${HOST}:${PORT}`);
  console.log(`[bot] routes ->`, collectRoutes());
});
