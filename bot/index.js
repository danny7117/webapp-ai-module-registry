// bot/index.js — minimal bot + robust /module-proposal (ESM, Node 18+)
import express from "express";
import crypto from "crypto";

const app = express();
app.disable("x-powered-by");
app.use(express.json());

const PORT = Number(process.env.PORT || 8787);
const HOST = "0.0.0.0";

// ---------- utils ----------
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

function hashKey(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ghFetch(url, opts = {}, { retries = 3, backoffMs = 600, timeoutMs = 10000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(id);

      // Retry on 429 / 5xx; also handle secondary rate limit (403 + retry-after)
      const retryAfter = Number(res.headers.get("retry-after") || 0) * 1000;
      const is5xx = res.status >= 500 && res.status <= 599;
      const is429 = res.status === 429;
      const is403Rate = res.status === 403 && retryAfter > 0;

      if ((is5xx || is429 || is403Rate) && attempt < retries) {
        const delay = Math.max(backoffMs * Math.pow(2, attempt), retryAfter);
        console.warn(`[github] transient ${res.status}, retrying in ${delay}ms ...`);
        await sleep(delay);
        continue;
      }

      return res;
    } catch (e) {
      clearTimeout(id);
      if (attempt < retries) {
        const delay = backoffMs * Math.pow(2, attempt);
        console.warn(`[github] fetch error: ${e?.name || e}. retrying in ${delay}ms ...`);
        await sleep(delay);
        continue;
      }
      throw e;
    }
  }
}

// ---------- routes ----------
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "bot", hint: "try /health /bot /__routes /module-proposal (POST)" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

app.get("/bot", (_req, res) => {
  res.json({ message: "Bot is running!" });
});

// --- POST /module-proposal ---
// Body: { title, description, labels?, assignees?, milestone? }
app.post("/module-proposal", async (req, res) => {
  try {
    // 1) Validate input
    const { title, description, labels = ["module-proposal"], assignees = [], milestone } = req.body || {};
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ ok: false, error: "Missing title" });
    }
    const desc = (description ?? "").toString();

    // 2) Validate env
    const token = process.env.GITHUB_TOKEN;
    const repoStr = process.env.GITHUB_REPO || "";
    const [owner, repo] = repoStr.split("/");
    if (!token || !owner || !repo) {
      return res.status(500).json({
        ok: false,
        error: "Missing GITHUB_TOKEN or GITHUB_REPO (expected owner/repo).",
      });
    }

    // 3) Build dedupe key (avoid duplicate issues)
    const normalized = `${title.trim().toLowerCase()}|${desc.trim().toLowerCase()}`;
    const dedupe = hashKey(normalized);
    const dedupeFooter = `\n\n<!-- module-proposal-dedupe:${dedupe} -->`;

    // 4) Check existing open issues with label to prevent duplicates
    //    (Lightweight scan first 100 open issues with the label)
    const queryURL = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=${encodeURIComponent(
      labels.join(",")
    )}&per_page=100`;
    const listRes = await ghFetch(
      queryURL,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "module-bot",
        },
      },
      { retries: 2, backoffMs: 500, timeoutMs: 8000 }
    );
    const list = listRes.ok ? await listRes.json() : [];
    const dup = Array.isArray(list) ? list.find((i) => typeof i?.body === "string" && i.body.includes(dedupeFooter)) : null;

    if (dup?.number) {
      return res.json({
        ok: true,
        deduped: true,
        issue_number: dup.number,
        issue_url: dup.html_url,
        message: "Duplicate proposal detected; returning existing issue.",
      });
    }

    // 5) Create issue
    const body =
      (desc && desc.trim().length > 0 ? desc.trim() : "(no description)") +
      `\n\n---\n**meta**\n- created via /module-proposal\n- dedupe: ${dedupe}\n${dedupeFooter}`;

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
          labels,
          assignees,
          milestone,
        }),
      },
      { retries: 3, backoffMs: 800, tim
