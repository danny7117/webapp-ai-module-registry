// scripts/validate_modules.cjs
import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import draft2020 from "ajv/dist/2020.js"; // 讓 bundler 保持穩定可省略，但我們在程式用 metaSchema

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const SCHEMA_DIR = path.join(REPO_ROOT, "schema");
const SCHEMA_PATH = path.join(SCHEMA_DIR, "module.manifest.schema.json"); // 你的 schema 存放處

function readJSONStrict(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  // 嚴格 JSON；如需容許註解/尾逗號，可自己換成清洗版
  return JSON.parse(raw);
}

function collectManifestFiles(dir = MODULES_DIR) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...collectManifestFiles(p));
    } else if (e.isFile() && e.name === "manifest.json") {
      out.push(p);
    }
  }
  return out;
}

function main() {
  // 1) 準備 AJV（draft 2020-12 + formats）
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);

  // 2) 加入 draft 2020-12 metaschema，避免「no schema with key or ref」錯誤
  const meta2020 = readJSONStrict(
    path.join(SCHEMA_DIR, "draft2020-12.schema.json")
  );
  ajv.addMetaSchema(meta2020); // 這一行是關鍵

  // 3) 載入我們的 manifest schema
  const manifestSchema = readJSONStrict(SCHEMA_PATH);
  const validate = ajv.compile(manifestSchema);

  // 4) 掃描 modules/**/manifest.json 並驗證
  const files = collectManifestFiles();
  console.log(`\n🧩 found ${files.length} manifest(s)`);
  let bad = 0;

  for (const file of files) {
    try {
      const json = readJSONStrict(file);
      const ok = validate(json);
      if (!ok) {
        bad++;
        console.log(`\n❌ ${path.relative(REPO_ROOT, file)} invalid:`);
        console.log(ajv.errorsText(validate.errors, { separator: "\n  - " }));
      } else {
        console.log(`✅ ${path.relative(REPO_ROOT, file)} OK`);
      }
    } catch (e) {
      bad++;
      console.log(`\n❌ ${path.relative(REPO_ROOT, file)} JSON 讀取/解析失敗: ${e.message}`);
    }
  }

  if (bad > 0) {
    console.log(`\n⛔ ${bad} manifest(s) invalid`);
    process.exit(1);
  } else {
    console.log(`\n🎉 ${files.length} manifest(s) validated OK`);
  }
}

main();
