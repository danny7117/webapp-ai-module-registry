// scripts/validate_modules.cjs  (CommonJS)
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");
const addFormats = require("ajv-formats").default;
const draft2020 = require("ajv-draft-2020").default;

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const SCHEMA_DIR = path.join(REPO_ROOT, "schema");
const SCHEMA_PATH = path.join(SCHEMA_DIR, "module.manifest.schema.json");

// 小工具
function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    throw new Error(`JSON 解析失敗：${p}\n${e.message}`);
  }
}

function collectManifests(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) stack.push(full);
      else if (name === "manifest.json") result.push(full);
    }
  }
  return result;
}

// 建 Ajv（draft2020 + formats）
const ajv = new Ajv({ strict: false, allErrors: true });
draft2020(ajv);
addFormats(ajv);

// 載入 schema
const schema = readJSON(SCHEMA_PATH);
const validate = ajv.compile(schema);

// 掃描
const manifests = collectManifests(MODULES_DIR);

if (manifests.length === 0) {
  console.log("⚠️ 找不到任何 modules/**/manifest.json，可先放一個 demo。");
}

// 檢查
let errors = 0;
for (const mf of manifests) {
  const data = readJSON(mf);
  const ok = validate(data);
  if (ok) {
    console.log(`✅ ${mf} — OK`);
  } else {
    errors++;
    console.log(`❌ ${mf} — 失敗`);
    console.log(ajv.errorsText(validate.errors, { separator: "\n" }));
  }
}

if (errors > 0) {
  console.error(`\n合計 ${errors} 個 manifest 未通過。`);
  process.exit(1);
} else {
  console.log(`\n🎉 所有 manifest 通過驗證。`);
}
