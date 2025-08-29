/* Build module_catalog.json from modules/**/manifest.json */
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const OUT = path.join(REPO_ROOT, "module_catalog.json");

function stripComments(s){return s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/(^|\s)\/\/.*$/gm,"");}
function readJSON(p){return JSON.parse(stripComments(fs.readFileSync(p,"utf8")));}

function listManifests(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...listManifests(full));
    else if (item.isFile() && item.name === "manifest.json") out.push(full);
  }
  return out;
}

function main(){
  const files = listManifests(MODULES_DIR);
  const items = files.map(f => {
    try {
      const m = readJSON(f);
      return {
        id: m.id,
        name: m.name,
        version: m.version,
        capabilities: m.capabilities,
        path: path.relative(REPO_ROOT, f)
      };
    } catch(e){
      return { path: path.relative(REPO_ROOT, f), error: String(e.message || e) };
    }
  });
  fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: items.length, items }, null, 2));
  console.log(`Catalog written: ${path.relative(REPO_ROOT, OUT)} (${items.length} items)`);
}
main();
