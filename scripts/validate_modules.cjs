import fs from "fs";
import path from "path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import draft2020 from "ajv/dist/2020.js";

const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const SCHEMA_PATH = path.join(REPO_ROOT, "schema", "module.manifest.schema.json");

const GATE = {
  bundle_kb: 500,   // ❗可調：單模組 bundle 不能超過 500KB
  cpu_ms:    200,   // ❗可調：單次呼叫推估 CPU 時間
  mem_mb:    128,   // ❗可調：占用記憶體
  max_degree: 20    // ❗可調：依賴出度上限
};

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addMetaSchema(draft2020);

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
const validate = ajv.compile(schema);

function readJSON(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function collectManifests(dir = MODULES_DIR) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) {
      const mp = path.join(dir, d.name, "manifest.json");
      if (fs.existsSync(mp)) out.push({ id: d.name, p: mp, data: readJSON(mp) });
    }
  }
  return out;
}

// ---- Safe Deploy 六層保護鏈 ---------------------------------------------------
// 1) Schema/Lint  2) 依賴圖 & 環  3) 互斥規則  4) 資源門檻(Gate)
// 5) 合規(年齡/授權)  6) 模擬啟用(乾跑) → 只輸出 plan，不動線上
// ------------------------------------------------------------------------------

function buildGraph(nodes) {
  const g = new Map();
  nodes.forEach(n => g.set(n.data.id || n.id, { requires: new Set(n.data.requires || []), conflicts: new Set(n.data.conflicts || []) }));
  return g;
}

function detectCycle(g) {
  const WHITE=0, GREY=1, BLACK=2;
  const color = new Map([...g.keys()].map(k => [k, WHITE]));
  function dfs(u, stack=[]) {
    color.set(u, GREY);
    for (const v of g.get(u).requires) {
      if (!g.has(v)) continue;
      if (color.get(v) === GREY) return [...stack, u, v]; // cycle
      if (color.get(v) === WHITE) {
        const c = dfs(v, [...stack, u]);
        if (c) return c;
      }
    }
    color.set(u, BLACK); return null;
  }
  for (const k of g.keys()) {
    if (color.get(k)===WHITE) {
      const c = dfs(k);
      if (c) return c;
    }
  }
  return null;
}

function checkMutex(g) {
  const pairs = [];
  for (const [k, v] of g.entries()) {
    for (const c of v.conflicts) {
      if (g.has(c)) pairs.push([k, c]);
    }
  }
  return pairs;
}

function checkGates(m) {
  const r = m.data.resources || {};
  const over = [];
  if (r.bundle_kb > GATE.bundle_kb) over.push(`bundle_kb ${r.bundle_kb} > ${GATE.bundle_kb}`);
  if (r.cpu_ms    > GATE.cpu_ms)    over.push(`cpu_ms ${r.cpu_ms} > ${GATE.cpu_ms}`);
  if (r.mem_mb    > GATE.mem_mb)    over.push(`mem_mb ${r.mem_mb} > ${GATE.mem_mb}`);
  const deg = (m.data.requires||[]).length;
  if (deg > GATE.max_degree) over.push(`requires degree ${deg} > ${GATE.max_degree}`);
  return over;
}

function checkCompliance(m) {
  const c = m.data.compliance || {};
  const errs = [];
  if (typeof c.min_age === "number" && c.min_age > 18) errs.push(`min_age ${c.min_age} too high for general audience`);
  if (!c.license) errs.push("license missing");
  return errs;
}

function dryRunEnablePlan(nodes) {
  // 乾跑：只輸出會啟用的清單（相依就近展開），不做實際變更
  return nodes.map(n => n.data.id || n.id);
}

function main() {
  const mods = collectManifests();
  let okCount = 0;
  const errors = [];

  // 1) Schema
  for (const m of mods) {
    const valid = validate(m.data);
    if (!valid) {
      errors.push({ id: m.data.id || m.id, step: "schema", detail: validate.errors });
    }
  }

  // 2) DAG
  const graph = buildGraph(mods);
  const cyc = detectCycle(graph);
  if (cyc) errors.push({ step: "dag", detail: `依賴循環: ${cyc.join(" -> ")}` });

  // 3) 互斥
  const mutex = checkMutex(graph);
  if (mutex.length) errors.push({ step: "mutex", detail: mutex.map(p => `${p[0]} x ${p[1]}`).join(", ") });

  // 4) Gate
  for (const m of mods) {
    const over = checkGates(m);
    if (over.length) errors.push({ id: m.data.id || m.id, step: "gate", detail: over.join("; ") });
  }

  // 5) 合規
  for (const m of mods) {
    const ce = checkCompliance(m);
    if (ce.length) errors.push({ id: m.data.id || m.id, step: "compliance", detail: ce.join("; ") });
  }

  // 6) 乾跑部署
  const plan = dryRunEnablePlan(mods);
  fs.writeFileSync(path.join(REPO_ROOT, "module_plan.json"), JSON.stringify({ enable: plan }, null, 2));

  // 彙整輸出
  if (errors.length) {
    console.error("❌ SafeDeploy failed:");
    for (const e of errors) console.error("-", e);
    process.exit(1);
  } else {
    okCount = mods.length;
    console.log(`✅ ${okCount} module(s) validated & gated OK`);
  }
}

main();
