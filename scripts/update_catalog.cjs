// scripts/update_catalog.cjs
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const CATALOG_PATH = path.join(REPO_ROOT, "module_catalog.json");

function readJSON(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function collect() {
  const items = [];
  if (!fs.existsSync(MODULES_DIR)) return items;
  for (const id of fs.readdirSync(MODULES_DIR)) {
    const modDir = path.join(MODULES_DIR, id);
    const manifestPath = path.join(modDir, "manifest.json");
    if (fs.existsSync(manifestPath)) {
      const j = readJSON(manifestPath);
      items.push({
        id: j.id,
        name: j.name,
        version: j.version,
        capabilities: j.capabilities || [],
        inputs: j.inputs || {},
        outputs: j.outputs || {},
        resources: j.resources || {},
        policy: j.policy || {},
        tags: j.tags || []
      });
    }
  }
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

function main() {
  const catalog = { updatedAt: new Date().toISOString(), modules: collect() };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  console.log("Catalog rebuilt:", CATALOG_PATH);
}

main();
