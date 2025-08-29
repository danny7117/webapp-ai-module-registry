import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");

function readJSON(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }

const nodes = [];
for (const d of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const mp = path.join(MODULES_DIR, d.name, "manifest.json");
  if (fs.existsSync(mp)) {
    const j = readJSON(mp);
    nodes.push({ id: j.id || d.name, requires: j.requires || [] });
  }
}
fs.writeFileSync(path.join(REPO_ROOT, "dag.json"), JSON.stringify({ nodes }, null, 2));
console.log(`wrote dag.json with ${nodes.length} nodes`);
