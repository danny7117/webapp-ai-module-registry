// scripts/validate_modules.cjs (CommonJS)
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const REPO_ROOT = process.cwd();
const SCHEMA_PATH = path.resolve(REPO_ROOT, 'schema', 'module.manifest.schema.json');
const MODULES_DIR = path.resolve(REPO_ROOT, 'modules');
const DRAFTS_DIR = path.resolve(MODULES_DIR, '_drafts');

function listManifestFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      if (p.startsWith(DRAFTS_DIR)) continue; // 忽略 drafts
      const mf = path.join(p, 'manifest.json');
      if (fs.existsSync(mf)) out.push(mf);
      // 也允許子目錄繼續掃（容錯）
      out.push(...listManifestFiles(p));
    }
  }
  return out;
}

function main() {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const ajv = new Ajv({
    allErrors: true,
    allowUnionTypes: true,
    strict: false
  });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const manifests = listManifestFiles(MODULES_DIR)
    .filter(p => !p.includes(`${path.sep}_drafts${path.sep}`));

  let ok = 0, errors = 0;
  for (const file of manifests) {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));

    // 跳過標記
    if (m.__skip_ci === true) {
      console.log(`↷ skip ${file} (__skip_ci)`);
      continue;
    }

    const valid = validate(m);
    if (!valid) {
      console.error(`❌ ${file} schema errors:`);
      for (const e of validate.errors) {
        console.error(`  - ${e.instancePath || '(root)'} ${e.message}`);
      }
      errors++;
    } else {
      ok++;
    }
  }

  if (errors > 0) {
    console.error(`\n✖ Module validation failed. ok=${ok}, errors=${errors}`);
    process.exit(1);
  } else {
    console.log(`\n✅ ${ok} module(s) validated OK`);
  }
}

main();
