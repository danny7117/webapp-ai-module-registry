// Node 18+ 建議
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Ajv from "ajv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODULES_DIR = path.resolve(__dirname, "..", "modules");
const SCHEMA_PATH = path.resolve(__dirname, "..", "schema", "module.manifest.schema.json");

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const validate = ajv.compile(schema);

const manifests = [];
const errors = [];

function readJSON(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

// 掃描 modules 資料夾下所有 manifest.json
function collectManifests(dir=MODULES_DIR) {
  if (!fs.existsSync(dir)) return;
  for (const d of fs.readdirSync(dir)) {
    const p = path.join(dir, d);
    if (fs.lstatSync(p).isDirectory()) {
      const mf = path.join(p, "manifest.json");
      if (fs.existsSync(mf)) manifests.push({ id: d, path: mf, json: readJSON(mf) });
    }
  }
}

// 基本互斥規則（可擴充）
function checkConflicts(m) {
  const set = new Set([...(m.dependencies || []), ...(m.conflicts || [])]);
  if (m.dependencies && m.conflicts) {
    for (const x of m.dependencies) {
      if (m.conflicts.includes(x)) {
        throw new Error(`${m.id}: dependency ${x} also listed in conflicts`);
      }
    }
  }
  // 黑名單示例：auth.oauth ⟂ auth.anonymous-only
  const caps = new Set(m.capabilities || []);
  if (caps.has("auth.oauth") && caps.has("auth.anonymous-only")) {
    throw new Error(`${m.id}: capabilities contain mutually exclusive auth modes`);
  }
}

// 簡易 DAG：只檢測自我循環與缺失節點
function checkDAG(all) {
  const ids = new Set(all.map(x => x.json.id));
  for (const x of all) {
    const deps = x.json.dependencies || [];
    if (deps.includes(x.json.id)) throw new Error(`${x.json.id}: self-dependency`);
    for (const d of deps) {
      if (!ids.has(d)) {
        // 允許外部模組？此處先報警告不致死
        console.warn(`[warn] ${x.json.id}: dependency ${d} not found in repo`);
      }
    }
  }
}

collectManifests();

for (const m of manifests) {
  const ok = validate(m.json);
  if (!ok) errors.push(`${m.path} schema errors:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`);
  try { checkConflicts(m.json); } catch (e) { errors.push(e.message); }
}

try { checkDAG(manifests); } catch (e) { errors.push(e.message); }

if (errors.length) {
  console.error("\n❌ Module validation failed:\n" + errors.map(e => "- " + e).join("\n"));
  process.exit(1);
} else {
  console.log(`✅ ${manifests.length} module(s) validated OK`);
}
