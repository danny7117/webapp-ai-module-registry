// scripts/scaffold_module.cjs
// 從 Issue 事件產生最小模組骨架，並更新 modules/registry.json

const fs = require("fs");
const path = require("path");

// 事件 payload
const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath || !fs.existsSync(eventPath)) {
  console.log("[scaffold] no GITHUB_EVENT_PATH, nothing to do.");
  process.exit(0);
}
const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
const issue = event.issue || {};
const issueNo = issue.number || "manual";
const titleRaw = (issue.title || "new module").trim();

// 建 slug
const slug = titleRaw
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");

// 簡單預設分類（你之後可改成依 label/body 決定）
const category = "storynest";

// 目錄：modules/<category>/mod-<slug>-<###>
const idSuffix = String(issueNo).padStart(3, "0");
const modId = `mod-${slug}-${idSuffix}`;
const modDir = path.join("modules", category, modId);

fs.mkdirSync(modDir, { recursive: true });

// spec.md
const specMd = `# ${titleRaw}

- issue: #${issueNo}
- category: ${category}
- slug: ${slug}

## problem
請在此描述要解決的問題。

## inputs
\`\`\`json
{ }
\`\`\`

## outputs
\`\`\`json
{ }
\`\`\`

## constraints
(可留空)
`;
fs.writeFileSync(path.join(modDir, "spec.md"), specMd, "utf8");

// schema.ts（最小）
const schemaTs = `export interface Inputs {}
export interface Outputs {}
`;
fs.writeFileSync(path.join(modDir, "schema.ts"), schemaTs, "utf8");

// 範例 page.tsx（供主專案引用）
const pageTsx = `export default function Page() {
  return <div>Module: ${slug} (issue #${issueNo})</div>;
}
`;
const appPage = path.join("app", "modules", modId, "page.tsx");
fs.mkdirSync(path.dirname(appPage), { recursive: true });
fs.writeFileSync(appPage, pageTsx, "utf8");

// 更新 registry.json
const registryFile = path.join("modules", "registry.json");
let registry = { modules: [] };
if (fs.existsSync(registryFile)) {
  try {
    registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
  } catch (e) {
    console.warn("[scaffold] registry.json parse failed, reset.");
  }
}
if (!Array.isArray(registry.modules)) registry.modules = [];

const now = Date.now();
const meta = {
  id: modId,
  category,
  title: titleRaw,
  status: "draft",
  visibility: "public",
  path: `${modDir}`,
  specVersion: "1.0.0",
  createdAt: now,
  updatedAt: now
};

const idx = registry.modules.findIndex((m) => m.id === meta.id);
if (idx >= 0) registry.modules[idx] = { ...registry.modules[idx], ...meta, updatedAt: now };
else registry.modules.push(meta);

fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2), "utf8");

console.log("[scaffold] generated:", { modDir, id: meta.id });
