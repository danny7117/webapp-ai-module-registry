// bot/index.js — strict validator + real GitHub issue creation (ESM)
import express from "express";
import crypto from "crypto";

const app = express();
app.disable("x-powered-by");
app.use(express.json());

const PORT = Number(process.env.PORT || 8787);
const HOST = "0.0.0.0";

// ==== categories (fixed 4) ====
const ALLOWED_CATEGORIES = new Set(["frontend", "integration", "ai", "utility"]);
const CATEGORY_LABEL = (c) => `category: ${c}`;

// ==== helpers ====
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
const hashKey = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ghFetch(url, opts = {}, { retries = 3, backoffMs = 600, timeoutMs = 10000 } = {}) {
  for (let a = 0; a <= retries; a++) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(id);

      const retryAfter = Number(res.headers.get("retry-after") || 0) * 1000;
      const s = res.status;
      const retryable = s === 429 || (s >= 500) || (s === 403 && retryAfter > 0);
      if (retryable && a < retries) {
        const delay = Math.max(backoffMs * 2 ** a, retryAfter);
        console.warn(`[github] transient ${s}, retry in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      return res;
    } catch (e) {
      clearTimeout(id);
      if (a < retries) {
        const delay = backoffMs * 2 ** a;
        console.warn(`[github] fetch error: ${e?.name || e}. retry in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
}

// ==== strict payload validator ====
function validatePayload(body) {
  const errors = [];

  if (!body || typeof body !== "object") errors.push("payload 必須是 JSON 物件");

  const title = String(body?.title || "").trim();
  const description = String(body?.description || "").trim();
  const category = String(body?.category || "").trim().toLowerCase();

  if (!title || !title.toLowerCase().startsWith("module:")) errors.push("title 必須以 `module: {名稱}` 開頭");
  if (!ALLOWED_CATEGORIES.has(category)) errors.push("category 必須是 frontend|integration|ai|utility 其一");

  const spec = body?.spec;
  if (!spec || typeof spec !== "object") {
    errors.push("spec 必須存在且為物件");
  } else {
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
  if (acceptance.length === 0) errors.push("acceptance（驗收條件）至少 1 筆");

  const example = body?.example;
  if (!example || typeof example !== "object") errors.push("example 必須存在（可為 I/O 範例或最小程式）");

  return { ok: errors.length === 0, errors, title, description, category };
}

// ==== routes ====
app.use((req, _res, next) => { console.log(`[req] ${req.method} ${req.originalUrl}`); next(); });

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "bot", hint: "try /health /bot /__routes /module-proposal (POST)" });
});
app.get("/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));
app.get("/bot",    (_req, res) => res.json({ message: "Bot is running!" }));
app.get("/__routes", (_req, res) => res.json({ routes: collectRoutes() }));

// === THE ONE: create issue when payload is valid ===
app.post("/module-proposal", async (req, res) => {
  try {
    // 1) validate
    const v = validatePayload(req.body);
    if (!v.ok) return res.status(400).json({ ok: false, reason: "invalid_payload", errors: v.errors });

    // 2) env
    const token = process.env.GITHUB_TOKEN;
    const [owner, repo] = (process.env.GITHUB_REPO || "").split("/");
    if (!token || !owner || !repo) {
      return res.status(500).json({ ok: false, error: "Missing GITHUB_TOKEN or GITHUB_REPO (expected owner/repo)" });
    }

    // 3) dedupe by title+category
    const normalized = `${v.title.toLowerCase()}|${v.category}`;
    const dedupe = hashKey(normalized);
    const dedupeFooter = `\n\n<!-- module-proposal-dedupe:${dedupe} -->`;

    // 4) search existing open issues with same category & ready
    const catLabel = CATEGORY_LABEL(v.category);
    const listUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=${encodeURIComponent(`module:proposal,module-ready,${catLabel}`)}&per_page=100`;
    const listRes = await ghFetch(listUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "module-bot"
      }
    }, { retries: 2, backoffMs: 500, timeoutMs: 8000 });
    const list = listRes.ok ? await listRes.json() : [];
    const dup = Array.isArray(list) ? list.find(i => typeof i?.body === "string" && i.body.includes(dedupeFooter)) : null;
    if (dup?.number) {
      return res.json({ ok: true, deduped: true, category: v.category, issue_number: dup.number, issue_url: dup.html_url });
    }

    // 5) compose issue
    const labels = Array.from(new Set(["module:proposal", "module-ready", catLabel, ...(req.body?.labels || [])]));
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
${(req.body.acceptance || []).map((a,idx)=>`${idx+1}. ${a}`).join("\n")}

### example
\`\`\`json
${JSON.stringify(req.body.example, null, 2)}
\`\`\`

---
- created via /module-proposal
- dedupe: ${dedupe}
${dedupeFooter}`;

    // 6) create issue
    const createRes = await ghFetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
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
      },
      { retries: 3, backoffMs: 800, timeoutMs: 12000 }
    );
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

// JSON 404
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Route not found",
    method: req.method,
    path: req.originalUrl,
    knownRoutes: collectRoutes()
  });
});

app.listen(PORT, HOST, () => {
  const filePath = (() => { try { return new URL(import.meta.url).pathname; } catch { return "unknown"; }})();
  console.log(`[bot] file         : ${filePath}`);
  console.log(`[bot] listening on : http://${HOST}:${PORT}`);
  console.log(`[bot] routes ->`, collectRoutes());
});
