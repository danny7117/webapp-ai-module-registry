// scripts/validate_modules.cjs
const fs = require("fs");
const path = require("path");

// 使用 Ajv 2020 直接支援 draft-2020-12
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

// 路徑
const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const SCHEMA_DIR = path.join(REPO_ROOT, "schema");
const SCHEMA_PATH = path.join(SCHEMA_DIR, "module.manifest.schema.json");

// 讀 JSON（移除 BOM 與註解）
function readJSON(filePath) {
  let s = fs.readFileSync(filePath, "utf8");
  // 去掉 BOM
  s = s.replace(/^\uFEFF/, "");
  // 去掉 //… 與 /* … */
  s = s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//gm, "");
  return JSON.parse(s);
}

// 收集所有 modules/**/manifest.json
function collectManifests(dir = MODULES_DIR) {
  const list = [];
  if (!fs.existsSync(dir)) return list;
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      // 這層是否有 manifest.json
      const mf = path.join(fp, "manifest.json");
      if (fs.existsSync(mf)) list.push(mf);
      // 繼續往下
      list.push(...collectManifests(fp));
    }
  }
  return list;
}

function main() {
  // 讀 schema（要的是「物件」，不是字串）
  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`[error] schema not found: ${SCHEMA_PATH}`);
    process.exit(1);
  }
  const schema = readJSON(SCHEMA_PATH);

  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    allowUnionTypes: true,
  });
  addFormats(ajv);

  const validate = ajv.compile(schema);

  const files = collectManifests();
  if (files.length === 0) {
    console.log("⚠️  no manifest found under modules/**/manifest.json");
    process.exit(0); // 沒檔案就略過，不當作錯誤
  }

  let errors = 0;
  for (const file of files) {
    try {
      const data = readJSON(file);
      const ok = validate(data);
      if (!ok) {
        errors++;
        console.log(`❌ ${file}`);
        console.log(ajv.errorsText(validate.errors, { separator: "\n  " }));
        console.log("");
      } else {
        console.log(`✅ ${file}`);
      }
    } catch (e) {
      errors++;
      console.log(`❌ ${file}`);
      console.log(`  ${e.message}`);
      console.log("");
    }
  }

  if (errors > 0) {
    console.log(`\n✖ validation failed: ${errors} file(s)`);
    process.exit(1);
  }
  console.log("\n✓ 1 module(s) validated OK");
}

main();
