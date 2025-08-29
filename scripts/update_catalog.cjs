// scripts/update_catalog.cjs
// 目的：掃描 modules/**/manifest.json，彙整成 module_catalog.json
// 規則：忽略 legacy/ 與 _skip_ci: true 的模組

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const OUTPUT = path.join(REPO_ROOT, "module_catalog.json");

function readJSON(file) {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function walkManifests(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === "legacy") continue;
    if (isDir(full)) {
      // 若這層就是一個 module 資料夾，找 manifest.json
      const manifestPath = path.join(full, "manifest.json");
      if (fs.existsSync(manifestPath)) out.push(manifestPath);
      // 同時也遞迴（允許更深層結構）
      out.push(...walkManifests(full));
    }
  }
  return out;
}

function toCatalogItem(file) {
  const rel = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
  const manifest = readJSON(file);

  // 跳過暫不參與 CI 的模組
  if (manifest._skip_ci === true) return null;

  // 你想放什麼都可以，這是最小集合
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    path: path.dirname(rel),
    capabilities: manifest.capabilities || [],
    category: manifest.category || null
  };
}

function main() {
  const manifests = walkManifests(MODULES_DIR);
  const items = [];
  for (const m of manifests) {
    try {
      const item = toCatalogItem(m);
      if (item) items.push(item);
    } catch (e) {
      console.error(`[catalog] skip due to invalid JSON: ${m}`);
      console.error(e.message);
    }
  }

  // 讓輸出穩定（避免順序造成不必要 commit）
  items.sort((a, b) => (a.id || "").localeCompare(b.id || ""));

  const json = JSON.stringify({ generatedAt: new Date().toISOString(), modules: items }, null, 2);
  fs.writeFileSync(OUTPUT, json, "utf8");
  console.log(`[catalog] wrote ${OUTPUT} (${items.length} modules)`);
}

main();
