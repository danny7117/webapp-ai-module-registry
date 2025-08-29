import fs from "fs";
import path from "path";

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");

function readJSON(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }

const queryTags = (process.env.TASK_TAGS || "").split(",").map(s=>s.trim()).filter(Boolean); // 例：TASK_TAGS="nlp,summarize"
const nodes = [];

for (const d of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const mp = path.join(MODULES_DIR, d.name, "manifest.json");
  if (fs.existsSync(mp)) {
    const j = readJSON(mp);
    const caps = j.capabilities || [];
    const overlap = caps.filter(c => queryTags.includes(c)).length;
    const score = overlap * 10 - (j.resources?.bundle_kb || 0) / 100; // 簡單 Rank：符合越多能力分數越高，bundle 越大扣分
    nodes.push({ id: j.id || d.name, score, requires: j.requires || [] });
  }
}

// 簡單規劃：取 top N，展開 requires
nodes.sort((a,b)=>b.score-a.score);
const pick = nodes.slice(0, Math.min(5, nodes.length));
const enable = new Set();
function addWithDeps(id){
  if (enable.has(id)) return;
  const n = nodes.find(x=>x.id===id); if (!n) return;
  (n.requires||[]).forEach(addWithDeps);
  enable.add(id);
}
pick.forEach(n=> addWithDeps(n.id));

fs.writeFileSync(path.join(REPO_ROOT, "selection_plan.json"), JSON.stringify({
  queryTags, ranked: nodes.slice(0,10).map(n=>({id:n.id,score:n.score})), enable: [...enable]
}, null, 2));

console.log(`Selection done. enable=${enable.size}`);
