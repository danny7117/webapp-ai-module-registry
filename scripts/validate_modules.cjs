/* Validate all module manifests (CJS + Ajv draft2020) */
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const draft2020 = require("ajv/dist/2020").default;

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const SCHEMA_PATH = path.join(REPO_ROOT, "schema", "module.manifest.schema.json");

// Gate：必填鍵（你之前強調的那組）
const REQUIRED_KEYS = [
  "id",
  "name",
  "version",
  "capabilities",
  "inputs",
  "outputs",
  "resources",
  "policy",
  "tests"
];

function stripComments(jsonText) {
  // 支援 // 與 /* */ 註解（單純處理，避免 JSON with comments 失敗）
  return jsonText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "");
}

function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(stripComments(raw));
}

function listManifests(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      out.push(...listManifests(full));
    } else if (item.isFile() && item.name === "manifest.json") {
      out.push(full);
    }
  }
  return out;
}

function gateRequiredKeys(obj, file) {
  const missing = REQUIRED_KEYS.filter((k) => !(k in obj));
  if (missing.length) {
    throw new Error(
      `Gate failed (${path.relative(REPO_ROOT, file)}): missing keys -> ${missing.join(", ")}`
    );
  }
}

function main() {
  console.log("webapp-ai-bot@1.0.0 validate");
  // 準備 AJV (draft2020)
  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    allowUnionTypes: true
  });
  addFormats(ajv);
  ajv.addMetaSchema(draft2020);

  // 載入 schema
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.warn(`[warn] schema not found: ${path.relative(REPO_ROOT, SCHEMA_PATH)} (skip ajv schema check, keep Gate only)`);
  }

  let validate = null;
  try {
    if (fs.existsSync(SCHEMA_PATH)) {
      const schema = readJSON(SCHEMA_PATH);
      validate = ajv.compile(schema);
    }
  } catch (e) {
    console.error("[schema] failed to compile:", e.message);
    process.exit(1);
  }

  // 收集 manifests
  const manifests = listManifests(MODULES_DIR);
  if (manifests.length === 0) {
    console.warn("[warn] no manifest.json found under modules/**");
  }

  let ok = 0, ng = 0;
  const errors = [];

  for (const file of manifests) {
    try {
      const obj = readJSON(file);

      // 可跳過 CI 的旗標（選擇性）
      if (obj && obj._skip_ci === true) {
        console.log(`[skip] ${path.relative(REPO_ROOT, file)} (_skip_ci=true)`);
        continue;
      }

      // Gate：必填鍵先檢查
      gateRequiredKeys(obj, file);

      // Schema 驗證（若 schema 存在）
      if (validate) {
        const valid = validate(obj);
        if (!valid) {
          const msgs = (validate.errors || []).map((e) => `${e.instancePath || "(root)"} ${e.message}`).join("; ");
          throw new Error(`schema invalid: ${msgs}`);
        }
      }

      ok++;
      console.log(`[OK] ${path.relative(REPO_ROOT, file)}`);
    } catch (e) {
      ng++;
      const rel = path.relative(REPO_ROOT, file);
      console.error(`[NG] ${rel} -> ${e.message}`);
      errors.push({ file: rel, message: e.message });
    }
  }

  console.log(`\nResult: ${ok} OK, ${ng} NG`);
  if (ng > 0) {
    console.error("Validation failed.");
    process.exit(1);
  }
}

main();
