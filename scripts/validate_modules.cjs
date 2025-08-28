// CommonJS validator for module manifests (Node 18/20)
const fs = require("fs");
const path = require("path");

// Try Ajv 2020-12 first; fallback to default Ajv if dist/2020 not present
let Ajv;
try { Ajv = require("ajv/dist/2020"); } catch (_) { Ajv = require("ajv"); }

// ---- helpers ----
function readJSON(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  // 允許 JSON 註解（// 或 /* */），先去掉再 parse，避免 CI 因註解爆掉
  const withoutComments = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  return JSON.parse(withoutComments);
}

// ---- paths ----
const REPO_ROOT   = path.resolve(__dirname, "..");
const MODULES_DIR = path.resolve(REPO_ROOT, "modules");
const SCHEMA_PATH = path.resolve(REPO_ROOT, "schema", "module.manifest.schema.json");

// ---- ajv init ----
let ajv = new Ajv({ allErrors: true, allowUnionTypes: true, strict: false });
try {
  // 手動加上 2020-12 meta，避免 "no schema with key or ref ..."
  const meta2020 = require("ajv/dist/refs/json-schema-2020-12.json");
  ajv.addMetaSchema(meta2020);
} catch (_) { /* ok if not available */ }

// compile schema
const schema   = readJSON(SCHEMA_PATH);
const validate = ajv.compile(schema);

// ---- collect manifests ----
const manifests = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "manifest.json") manifests.push(p);
  }
}
walk(MODULES_DIR);

// ---- validate ----
const errors = [];
for (const file of manifests) {
  try {
    const data = readJSON(file);
    const ok = validate(data);
    if (!ok) errors.push({ file, errs: validate.errors });
  } catch (e) {
    errors.push({ file, errs: [{ message: e.message }] });
  }
}

// ---- report ----
if (errors.length) {
  console.error("\n❌ Module validation failed:");
  for (const { file, errs } of errors) {
    console.error(`- ${path.relative(REPO_ROOT, file)}`);
    console.error(ajv.errorsText(errs, { separator: "\n  " }));
  }
  process.exit(1);
} else {
  console.log(`\n✅ ${manifests.length} module(s) validated OK`);
}
