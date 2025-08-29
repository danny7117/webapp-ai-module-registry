import Ajv from "ajv";
import addFormats from "ajv-formats";
import draft2020 from "ajv/dist/2020.js";   // ⭐ 關鍵

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addMetaSchema(draft2020);   // ⭐ 加入 draft 2020-12 支援

// scripts/validate_modules.cjs
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const SCHEMA_DIR = path.join(REPO_ROOT, "schema");
const SCHEMA_PATH = path.join(SCHEMA_DIR, "module.manifest.schema.json"); // 你的 schema 檔名可調

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function collectManifests(dir = MODULES_DIR) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const id of fs.readdirSync(dir)) {
    const modDir = path.join(dir, id);
    if (!fs.statSync(modDir).isDirectory()) continue;
    const manifestPath = path.join(modDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      out.push({ id, path: manifestPath, json: readJSON(manifestPath) });
    }
  }
  return out;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function main() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schema = readJSON(SCHEMA_PATH);
  const validate = ajv.compile(schema);

  const manifests = collectManifests();
  if (manifests.length === 0) {
    console.warn("[warn] no manifest found under modules/**");
  }

  const errors = [];
  const ids = new Set();

  for (const m of manifests) {
    if (!validate(m.json)) {
      errors.push({
        file: m.path,
        errors: validate.errors
      });
      continue;
    }

    // Gate 1: id 唯一、格式檢查
    if (typeof m.json.id !== "string" || !/^[a-z0-9][a-z0-9-_]{1,62}$/.test(m.json.id)) {
      errors.push({ file: m.path, errors: ["invalid id format"] });
    }
    if (ids.has(m.json.id)) {
      errors.push({ file: m.path, errors: ["duplicated id"] });
    } else {
      ids.add(m.json.id);
    }

    // Gate 2: semver 簡檢
    if (typeof m.json.version !== "string" || !/^\d+\.\d+\.\d+/.test(m.json.version)) {
      errors.push({ file: m.path, errors: ["invalid version (semver required)"] });
    }

    // Gate 3: 互斥/依賴欄位基本檢查
    const conflicts = m.json.conflicts || [];
    const deps = m.json.dependencies || [];
    if (!Array.isArray(conflicts) || !Array.isArray(deps)) {
      errors.push({ file: m.path, errors: ["dependencies/conflicts must be arrays"] });
    }

    // Gate 4: 資源/政策欄位基本檢查
    if (m.json.resources && typeof m.json.resources !== "object") {
      errors.push({ file: m.path, errors: ["resources must be object"] });
    }
    if (m.json.policy && typeof m.json.policy !== "object") {
      errors.push({ file: m.path, errors: ["policy must be object"] });
    }
  }

  if (errors.length) {
    console.error("\n✗ Module validation failed:");
    for (const e of errors) {
      console.error(`- ${e.file}`);
      console.error(e.errors);
    }
    process.exit(1);
  } else {
    console.log(`\n✓ ${manifests.length} module(s) validated OK`);
  }
}

main();
