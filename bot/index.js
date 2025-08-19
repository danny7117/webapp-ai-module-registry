// ---- constants ----
const ALLOWED_CATEGORIES = new Set(["frontend", "integration", "ai", "utility"]);

function validatePayload(body) {
  const errors = [];

  // 基本欄位
  if (!body || typeof body !== "object") errors.push("payload 必須是 JSON 物件");
  const title = String(body?.title || "").trim();
  const description = String(body?.description || "").trim();
  const category = String(body?.category || "").trim().toLowerCase();
  if (!title || !title.toLowerCase().startsWith("module:")) errors.push("title 必須以 `module: {名稱}` 開頭");
  if (!ALLOWED_CATEGORIES.has(category)) errors.push("category 必須是 frontend|integration|ai|utility 其一");

  // 規格
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

// ---- replace your POST handler with this strict version ----
app.post("/module-proposal", async (req, res) => {
  try {
    // 1) 驗證 payload
    const v = validatePayload(req.body);
    if (!v.ok) {
      return res.status(400).json({ ok: false, reason: "invalid_payload", errors: v.errors });
    }

    // 2) 環境變數
    const token = process.env.GITHUB_TOKEN;
    const [owner, repo] = (process.env.GITHUB_REPO || "").split("/");
    if (!token || !owner || !repo) {
      return res.status(500).json({ ok: false, error: "Missing GITHUB_TOKEN or GITHUB_REPO (expected owner/repo)" });
    }

    // 3) 去重 key（title + category）
    const normalized = `${v.title.toLowerCase()}|${v.category}`;
    const dedupe = hashKey(normalized);
    const dedupeFooter = `\n\n<!-- module-proposal-dedupe:${dedupe} -->`;

    // 4) 查重（只看 open + module-ready + 同分類）
    const catLabel = `category: ${v.category}`;
    const q = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&labels=${encodeURIComponent(`module-ready,${catLabel}`)}&per_page=100`;
    const listRes = await ghFetch(q, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent":"module-bot"} }, { retries:2, backoffMs:500, timeoutMs:8000 });
    const list = listRes.ok ? await listRes.json() : [];
    const dup = Array.isArray(list) ? list.find(i => typeof i?.body === "string" && i.body.includes(dedupeFooter)) : null;
    if (dup?.number) {
      return res.json({ ok: true, deduped: true, category: v.category, issue_number: dup.number, issue_url: dup.html_url });
    }

    // 5) 組 Issue 內容（包含完整規格）
    const labels = Array.from(new Set([ "module-proposal", "module-ready", catLabel, ...(req.body?.labels || []) ]));
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

    // 6) 建 Issue（只要通過驗證就標 `module-ready`，給 workflow 當觸發門檻）
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
