// scripts/validate_modules.cjs  (CommonJS 版)
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv").default;
const addFormats = require("ajv-formats").default;
const draft2020 = require("ajv/dist/2020").default;

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const SCHEMA_DIR = path.join(REPO_ROOT, "schema");
const SCHEMA_PATH = path.join(SCHEMA_DIR, "module.manifest.schema.json");

// 讀 JSON（避免 BOM/編碼問題）
function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// 掃描 modules 下所有 manifest.json
function collectManifests(root = MODULES_DIR) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const q = [root];
  while (q.length) {
    const d = q.pop();
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) q.push(p);
      else if (name === "manifest.json") out.push(p);
    }
  }
  return out;
}

function validateAll() {
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addMetaSchema(draft2020); // 支援 2020-12

  const schema = readJSON(SCHEMA_PATH);
  const validate = ajv.compile(schema);

  const files = collectManifests();
  let ok = 0, bad = 0;

  for (const f of files) {
    const data = readJSON(f);
    const valid = validate(data);
    if (valid) {
      console.log(`✅ OK  ${f}`);
      ok++;
    } else {
      console.error(`❌ FAIL ${f}`);
      console.error(ajv.errorsText(validate.errors, { separator: "\n" }));
      bad++;
    }
  }

  console.log(`\nSummary: OK=${ok}, FAIL=${bad}`);
  if (bad > 0) process.exit(1);
}

validateAll();
