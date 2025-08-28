// scripts/validate_modules.cjs
// Node 18+ / CommonJS 版（使用 require）
// 功能：驗證 modules/**/manifest.json 是否符合 Schema，檢查互斥/依賴，做簡易 DAG 健檢

const fs = require("fs");
const path = require("path");
const Ajv = require("ajv/dist/2020");  // ← 使用 2020 規格

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.resolve(REPO_ROOT, "modules");
const SCHEMA_PATH = path.resolve(REPO_ROOT, "schema", "module.manifest.schema.json");

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const validate = ajv.compile(schema);

const manifests = [];   // { id, path, json }
const errors = [];
const warnings = [];

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    throw new Error(`Invalid JSON: ${filePath}\n${e.message}`);
  }
}

// 掃描 modules/**/manifest.json
function collectManifests(dir = MODULES_DIR) {
  if (!fs.existsSync(dir)) {
    warnings.push(`[warn] modules/ folder not found: ${dir}`);
    return;
  }
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    if (!it.isDirectory()) continue;
    const modDir = path.join(dir, it.name);
    const mf = path.join(modDir, "manifest.json");
    if (fs.existsSync(mf)) {
      const json = readJSON(mf);
      manifests.push({ id: it.name, path: mf, json });
    } else {
      warnings.push(`[warn] missing manifest.json in ${modDir}`);
    }
  }
}

// 基本互斥規則 & 自檢
function checkConflicts(m) {
  const id = m.id || "(unknown-id)";

  // 依賴與互斥同時包含同一模組
  const deps = Array.isArray(m.dependencies) ? m.dependencies : [];
  const confs = Array.isArray(m.conflicts) ? m.conflicts : [];
  for (const d of deps) {
    if (confs.includes(d)) {
      throw new Error(`${id}: dependency "${d}" also appears in conflicts`);
    }
  }

  // 能力互斥範例（可依需求擴充）
  const caps = new Set(Array.isArray(m.capabilities) ? m.capabilities : []);
  const isMutuallyExclusive = (a, b) => caps.has(a) && caps.has(b);

  // 範例：匿名模式與 OAuth 互斥
  if (isMutuallyExclusive("auth.oauth", "auth.anonymous-only")) {
    throw new Error(`${id}: capabilities contain mutually exclusive auth modes (auth.oauth ⟂ auth.anonymous-only)`);
  }
}

// 簡易 DAG 健檢：自依賴、缺失依賴提示
function checkDAG(all) {
  const idToManifest = new Map();
  for (const x of all) {
    const mid = x.json.id || x.id;
    if (idToManifest.has(mid)) {
      warnings.push(`[warn] duplicate module id detected: ${mid}`);
    }
    idToManifest.set(mid, x.json);
  }

  // 自依賴 & 缺失依賴
  for (const x of all) {
    const m = x.json;
    const mid = m.id || x.id;

    const deps = Array.isArray(m.dependencies) ? m.dependencies : [];
    if (deps.includes(mid)) {
      throw new Error(`${mid}: self-dependency detected`);
    }
    for (const d of deps) {
      if (!idToManifest.has(d)) {
        warnings.push(`[warn] ${mid}: dependency "${d}" not found in repo (external or missing)`);
      }
    }
  }

  // 循環偵測（簡單 DFS）
  const visited = new Set();
  const inStack = new Set();

  function dfs(nodeId) {
    if (inStack.has(nodeId)) {
      throw new Error(`cycle detected in dependencies around "${nodeId}"`);
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    inStack.add(nodeId);

    const m = idToManifest.get(nodeId);
    if (m) {
      const deps = Array.isArray(m.dependencies) ? m.dependencies : [];
      for (const d of deps) {
        if (idToManifest.has(d)) dfs(d);
      }
    }
    inStack.delete(nodeId);
  }

  for (const mid of idToManifest.keys()) {
    dfs(mid);
  }
}

function main() {
  collectManifests();

  // Schema 驗證 & 互斥檢查
  for (const m of manifests) {
    const ok = validate(m.json);
    if (!ok) {
      errors.push(`${m.path} schema errors:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`);
    }
    try {
      checkConflicts(m.json);
    } catch (e) {
      errors.push(`${m.path} ${e.message}`);
    }
  }

  // DAG 檢查
  try {
    checkDAG(manifests);
  } catch (e) {
    errors.push(e.message);
  }

  // 輸出結果
  if (warnings.length) {
    console.warn("\nWarnings:");
    for (const w of warnings) console.warn(" - " + w);
  }

  if (errors.length) {
    console.error("\n❌ Module validation failed:");
    for (const err of errors) console.error(" - " + err);
    process.exit(1);
  } else {
    console.log(`\n✅ ${manifests.length} module(s) validated OK`);
  }
}

main();
