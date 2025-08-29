// scripts/validate_modules.cjs
// 功能：
// - 讀取 modules/**/manifest.json（遞迴）
// - 自動補欄位 (id/name/version/capabilities/...)
// - Schema 驗證（Ajv 2020 + formats）
// - 依賴圖循環檢查（DAG）/互斥檢查（conflicts）
// - Gate 檢查（bundle/cpu/mem/依賴出度上限）/合規（min_age, license）
// - 產出 summary.json（總模組數、通過/失敗清單）
// - 失敗時 exit code 1，CI 會紅燈；通過則綠燈

const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats");

// 路徑
const REPO_ROOT = path.resolve(__dirname, "..");
const MODULES_DIR = path.join(REPO_ROOT, "modules");
const SCHEMA_PATH = path.join(REPO_ROOT, "schema", "module.manifest.schema.json");
const SUMMARY_PATH = path.join(REPO_ROOT, "summary.json");
const PLAN_PATH = path.join(REPO_ROOT, "module_plan.json");

// Gate（可調）
const GATE = {
  bundle_kb: 500,
  cpu_ms: 200,
  mem_mb: 128,
  max_degree: 20,
};

// 安全讀 JSON（移除 BOM；空檔案允許作為 {}）
function readJSONSafe(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const t = raw.trim();
  if (!t) return {}; // 空檔視為空物件，後續 AutoFill
  try {
    return JSON.parse(raw);
  } catch (e) {
    // 回傳特殊標記給上層
    return { __parse_error: e.message };
  }
}

// 遞迴收集 manifest.json
function collectManifests(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const mf = path.join(p, "manifest.json");
      if (fs.existsSync(mf)) out.push(mf);
      out.push(...collectManifests(p));
    }
  }
  return out;
}

// 自動補欄位：以資料夾名當 id 預設；其他欄位給安全預設值
function autoFill(manifest, folderName) {
  const m = { ...manifest };
  if (!m.id || typeof m.id !== "string") m.id = folderName;
  if (!m.name || typeof m.name !== "string") m.name = `Module ${m.id}`;
  if (!m.version || typeof m.version !== "string") m.version = "1.0.0";
  if (!Array.isArray(m.capabilities)) m.capabilities = [];

  if (!Array.isArray(m.requires)) m.requires = [];
  if (!Array.isArray(m.conflicts)) m.conflicts = [];

  m.resources = m.resources && typeof m.resources === "object" ? m.resources : {};
  if (typeof m.resources.bundle_kb !== "number") m.resources.bundle_kb = 0;
  if (typeof m.resources.cpu_ms !== "number") m.resources.cpu_ms = 0;
  if (typeof m.resources.mem_mb !== "number") m.resources.mem_mb = 0;

  m.compliance = m.compliance && typeof m.compliance === "object" ? m.compliance : {};
  if (typeof m.compliance.min_age !== "number") m.compliance.min_age = 0;
  if (typeof m.compliance.license !== "string") m.compliance.license = "MIT";

  m.ui = m.ui && typeof m.ui === "object" ? m.ui : {};
  if (!Array.isArray(m.ui.containers)) m.ui.containers = [];

  m.risk = m.risk && typeof m.risk === "object" ? m.risk : {};
  if (typeof m.risk.rollback !== "string") m.risk.rollback = "disable-module";

  m.release = m.release && typeof m.release === "object" ? m.release : {};
  if (typeof m.release.publish !== "boolean") m.release.publish = true;
  if (!Array.isArray(m.release.tags)) m.release.tags = [];

  return m;
}

// 檢查 Gate 超標
function checkGates(m) {
  const r = m.resources || {};
  const errs = [];
  if (r.bundle_kb > GATE.bundle_kb) errs.push(`bundle_kb ${r.bundle_kb} > ${GATE.bundle_kb}`);
  if (r.cpu_ms > GATE.cpu_ms) errs.push(`cpu_ms ${r.cpu_ms} > ${GATE.cpu_ms}`);
  if (r.mem_mb > GATE.mem_mb) errs.push(`mem_mb ${r.mem_mb} > ${GATE.mem_mb}`);
  const deg = (m.requires || []).length;
  if (deg > GATE.max_degree) errs.push(`requires count ${deg} > ${GATE.max_degree}`);
  return errs;
}

// 合規檢查
function checkCompliance(m) {
  const c = m.compliance || {};
  const errs = [];
  if (!c.license) errs.push("license missing");
  if (typeof c.min_age === "number" && c.min_age < 0) errs.push("min_age < 0");
  return errs;
}

// 建圖
function buildGraph(mods) {
  const g = new Map();
  for (const m of mods) {
    g.set(m.id, { requires: new Set(m.requires || []), conflicts: new Set(m.conflicts || []) });
  }
  return g;
}

// DAG cycle 檢查
function detectCycle(g) {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map([...g.keys()].map(k => [k, WHITE]));
  function dfs(u, stack) {
    color.set(u, GREY);
    for (const v of g.get(u).requires) {
      if (!g.has(v)) continue;
      const c = color.get(v);
      if (c === GREY) return [...stack, u, v]; // found cycle
      if (c === WHITE) {
        const cyc = dfs(v, [...stack, u]);
        if (cyc) return cyc;
      }
    }
    color.set(u, BLACK);
    return null;
  }
  for (const k of g.keys()) {
    if (color.get(k) === WHITE) {
      const cyc = dfs(k, []);
      if (cyc) return cyc;
    }
  }
  return null;
}

// 互斥檢查
function listMutexPairs(g) {
  const pairs = [];
  for (const [k, v] of g.entries()) {
    for (const c of v.conflicts) {
      if (g.has(c)) pairs.push([k, c]);
    }
  }
  return pairs;
}

function main() {
  // 準備 AJV
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);

  if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`❌ schema not found: ${SCHEMA_PATH}`);
    process.exit(1);
  }
  const schemaRaw = fs.readFileSync(SCHEMA_PATH, "utf8").replace(/^\uFEFF/, "");
  let schema;
  try { schema = JSON.parse(schemaRaw); }
  catch (e) {
    console.error(`❌ schema JSON parse error: ${e.message}`);
    process.exit(1);
  }
  const validate = ajv.compile(schema);

  // 收集 manifests
  const files = collectManifests(MODULES_DIR);
  if (files.length === 0) {
    console.log("ℹ️ no manifests found under modules/**, skip.");
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify({ total: 0, passed: 0, failed: 0, errors: [] }, null, 2));
    process.exit(0);
  }

  const results = [];
  const modules = [];

  for (const fp of files) {
    const folderName = path.basename(path.dirname(fp));
    const raw = readJSONSafe(fp);

    if (raw.__parse_error) {
      results.push({ path: fp, id: folderName, status: "fail", step: "parse", errors: [raw.__parse_error] });
      continue;
    }

    // 自動補欄位
    const filled = autoFill(raw, folderName);

    // Schema 驗證
    const ok = validate(filled);
    if (!ok) {
      results.push({
        path: fp,
        id: filled.id,
        status: "fail",
        step: "schema",
        errors: (validate.errors || []).map(e => `${e.instancePath || "/"} ${e.message}`)
      });
      continue;
    }

    // Gate/合規
    const gateErrs = checkGates(filled);
    const compErrs = checkCompliance(filled);
    if (gateErrs.length || compErrs.length) {
      results.push({
        path: fp,
        id: filled.id,
        status: "fail",
        step: "gate/compliance",
        errors: [...gateErrs, ...compErrs]
      });
      continue;
    }

    // 暫存通過的模組，待會做 DAG/互斥
    modules.push(filled);
    results.push({ path: fp, id: filled.id, status: "pass", step: "all", errors: [] });
  }

  // DAG / 互斥在 module 層面檢查
  let graphErr = null;
  if (modules.length) {
    const g = buildGraph(modules);
    const cyc = detectCycle(g);
    if (cyc) {
      graphErr = { step: "dag", errors: [`依賴循環: ${cyc.join(" -> ")}`] };
    }
    const mutex = listMutexPairs(g);
    if (mutex.length) {
      const msg = mutex.map(p => `${p[0]} x ${p[1]}`).join(", ");
      graphErr = graphErr || {};
      graphErr.step = graphErr.step ? graphErr.step + "+mutex" : "mutex";
      graphErr.errors = (graphErr.errors || []).concat([`互斥衝突: ${msg}`]);
    }
  }

  // summary 統計
  const total = results.length;
  const passed = results.filter(r => r.status === "pass").length;
  const failed = total - passed;

  const summary = {
    total,
    passed,
    failed,
    graph: graphErr || null,
    errors: results.filter(r => r.status === "fail").map(r => ({
      id: r.id, path: r.path, step: r.step, errors: r.errors
    }))
  };

  // 乾跑部署計畫（僅列出可啟用的 id）
  const enablePlan = modules.map(m => m.id);
  fs.writeFileSync(PLAN_PATH, JSON.stringify({ enable: enablePlan }, null, 2));

  // 輸出 summary.json
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  // 主控台摘要
  console.log(`\n===== Module Summary =====`);
  console.log(`Total: ${total}  |  Passed: ${passed}  |  Failed: ${failed}`);
  if (graphErr) console.log(`Graph: ${graphErr.errors.join(" | ")}`);
  if (failed > 0) {
    console.log(`\nFirst 10 errors:`);
    summary.errors.slice(0, 10).forEach(e => {
      console.log(`- [${e.step}] ${e.id} @ ${e.path}`);
      e.errors.slice(0, 3).forEach(msg => console.log(`    • ${msg}`));
    });
  }

  if (failed > 0 || graphErr) process.exit(1);
  console.log(`\n✅ All modules validated & gated OK.`);
}

main();
