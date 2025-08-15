// scripts/scaffold_module.js
const { writeFileSync, mkdirSync, existsSync, readFileSync } = require("fs");
const { join } = require("path");

const title = process.env.ISSUE_TITLE || "";
const body = (process.env.ISSUE_BODY || "").trim();
const no = process.env.ISSUE_NUMBER || "0";

// 解析簡單 key:value 區塊（出自 Markdown 模板）
function section(key) {
  const re = new RegExp(`${key}:\\s*([\\s\\S]*?)(\\n\\w+:|$)`, "i");
  const m = body.match(re);
  if (!m) return "";
  return m[1].replace(/^\\|/gm, "").trim();
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/^\[module\]\s*/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const category = (section("category").split(/\s/)[0] || "misc").toLowerCase();
const problem = section("problem");
const inputs = section("inputs") || "{}";
const outputs = section("outputs") || "{}";
const constraints = section("constraints") || "-";

const base = title.replace(/^\[Module\]\s*/i, "").trim() || "unnamed";
const slug = slugify(title || base) || "unnamed";
const moduleId = `mod-${category}-${slug}-${String(no).padStart(3, "0")}`;

// 建目錄
const dir = join("modules", category, moduleId);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

// spec.md
const spec = `# ${base}

**Module ID**: ${moduleId}
**Category**: ${category}

## Problem
${problem}

## Inputs (rough)
\`\`\`json
${inputs}
\`\`\`

## Outputs (rough)
\`\`\`json
${outputs}
\`\`\`

## Constraints
${constraints}

## Flow (draft)
1) Validate inputs
2) Call AI / services
3) Store artifacts
4) Return outputs

## Error Codes (draft)
- E001_INVALID_INPUT
- E002_UPSTREAM_FAIL
- E003_TIMEOUT
`;
writeFileSync(join(dir, "spec.md"), spec, "utf8");

// schema.ts（佔位，之後你再補 Zod）
const schemaTs = `import { z } from "zod";

export const ${moduleId.replace(/-/g, "_")}_input = z.object({
  // TODO: define from spec
});

export const ${moduleId.replace(/-/g, "_")}_output = z.object({
  // TODO: define from spec
});
`;
writeFileSync(join(dir, "schema.ts"), schemaTs, "utf8");

// registry.json 追加一筆
const registryPath = join("modules", "registry.json");
let registry = { modules: [] };
try {
  registry = JSON.parse(readFileSync(registryPath, "utf8"));
} catch (_) {}
if (!registry.modules) registry.modules = [];
registry.modules.push({
  id: moduleId,
  category,
  title: base,
  status: "draft",
  visibility: "public",
  path: `modules/${category}/${moduleId}`,
  specVersion: "1.0.0",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
writeFileSync(registryPath, JSON.stringify(registry, null, 2), "utf8");

// API 佔位
const apiDir = join("app", "api", "modules", moduleId);
if (!existsSync(apiDir)) mkdirSync(apiDir, { recursive: true });
writeFileSync(
  join(apiDir, "route.ts"),
  `import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  return NextResponse.json({ ok: true, module: "${moduleId}" });
}
`,
  "utf8"
);

// 前端頁 佔位
const pageDir = join("app", "modules", moduleId);
if (!existsSync(pageDir)) mkdirSync(pageDir, { recursive: true });
writeFileSync(
  join(pageDir, "page.tsx"),
  `export default function Page() {
  return <main className="p-6">
    <h1>${base}</h1>
    <p>Module ID: ${moduleId}</p>
  </main>;
}
`,
  "utf8"
);

console.log("Scaffolded:", moduleId);