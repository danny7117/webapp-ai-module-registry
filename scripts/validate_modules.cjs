// scripts/validate_modules.cjs
const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");     // 不再用 ajv-draft-2020（避免 404）
const addFormats = require("ajv-formats");

// 讀檔 + 去除 BOM
function readJSON(p) {
  const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

// 走訪 modules 下的 manifest.json
function collectManifests(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...collectManifests(p));
    else if (name.isFile() && name.name.toLowerCase() === "manifest.json") out.push(p);
  }
  return out;
}

function printAjvErrors(errors) {
  return errors
    .map(e => {
      const loc = e.instancePath || "(root)";
      const msg = e.message || "invalid";
      const data = e.params && e.params.allowedValues ? ` | allowed: ${JSON.stringify(e.params.allowedValues)}` : "";
      return `  - ${loc} ${msg}${data}`;
    })
    .join("\n");
}

async function main() {
  const REPO_ROOT = path.resolve(__dirname, "..");
  const MODULES_DIR = path.join(REPO_ROOT, "modules");
  const SCHEMA_PATH = path.join(REPO_ROOT, "schema", "module.manifest.schema.json");

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  let schema;
  try {
    schema = readJSON(SCHEMA_PATH);
  } catch (e) {
    console.error(`❌ 讀取 schema 失敗：${SCHEMA_PATH}\n   ${e.message}`);
    process.exit(1);
  }

  const validate = ajv.compile(schema);

  const files = collectManifests(MODULES_DIR);
  if (files.length === 0) {
    console.log("ℹ️  modules/* 下沒有找到任何 manifest.json，可略過驗證。");
    process.exit(0);
  }

  let failed = 0;

  for (const fp of files) {
    try {
      const text = fs.readFileSync(fp, "utf8").replace(/^\uFEFF/, "");
      if (!text.trim()) {
        console.warn(`⚠️  跳過空檔：${fp}`);
        continue;
      }
      const data = JSON.parse(text);
      const ok = validate(data);
      if (ok) {
        console.log(`✅ OK: ${fp}`);
      } else {
        console.error(`❌ NG: ${fp}\n${printAjvErrors(validate.errors)}`);
        failed++;
      }
    } catch (e) {
      console.error(`❌ 讀取/解析失敗：${fp}\n   ${e.message}`);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n總結：${failed} 個 manifest 未通過。`);
    process.exit(1);
  }
  console.log("\n🎉 所有 manifest 通過驗證。");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
