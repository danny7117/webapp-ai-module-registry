// scripts/validate_modules.cjs
const fs = require("fs");
const path = require("path");

// Ajv draft-2020 + formats（CJS 寫法）
const Ajv2020 = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats");

const REPO_ROOT = __dirname ? path.resolve(__dirname, "..") : process.cwd();
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const SCHEMA_FILE = path.join(REPO_ROOT, "schema", "module.manifest.schema.json");

// 安全讀 JSON（自動去掉 BOM）
function readJSON(file) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

// 收集 modules/**/manifest.json
function collectManifests(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const name of fs.readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const fp = path.join(root, name.name, "manifest.json");
    if (fs.existsSync(fp)) out.push(fp);
  }
  return out;
}

function main() {
  const schema = readJSON(SCHEMA_FILE);
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);

  const manifests = collectManifests(MODULES_DIR);
  if (manifests.length === 0) {
    console.log("No manifests found, skip.");
    process.exit(0);
  }

  let ok = true;
  for (const f of manifests) {
    try {
      const data = readJSON(f);
      const validate = ajv.compile(schema);
      const valid = validate(data);
      if (!valid) {
        ok = false;
        console.error(`✗ ${f}`);
        console.error(validate.errors);
      } else {
        console.log(`✓ ${f}`);
      }
    } catch (e) {
      ok = false;
      console.error(`✗ ${f} - ${e.message}`);
    }
  }

  if (!ok) process.exit(1);
  console.log(`\nAll ${manifests.length} manifest(s) validated.`);
}

if (require.main === module) main();
