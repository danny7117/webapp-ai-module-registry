// scripts/generate_manifests.cjs (CommonJS)
const fs = require('fs');
const path = require('path');

const SCHEMA_CATEGORY_MAP = new Set(["core","utility","creative","business"]); // 四大類別

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readRegistry(file) {
  const ext = path.extname(file).toLowerCase();
  const raw = fs.readFileSync(file, 'utf8');
  if (ext === '.ndjson' || ext === '.ndj') {
    return raw.trim().split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
  }
  // 預設 .json 陣列
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : data.items || [];
}

// 預設值（缺欄位時填充，避免 schema 不通過）
function defaultsFromRegistry(r) {
  const id = String(r.id || r.module_id || r.code || '').trim();
  const name = String(r.name || r.title || id).trim() || `M-${Date.now()}`;
  const version = String(r.version || '1.0.0');
  const category = SCHEMA_CATEGORY_MAP.has((r.category||'').toLowerCase())
    ? (r.category||'').toLowerCase()
    : inferCategory(r); // 若未填，用能力/來源推斷

  return {
    id,
    name,
    version,
    category,
    capabilities: Array.isArray(r.capabilities) && r.capabilities.length ? r.capabilities : [String(r.capability || `${id}.basic`)],
    inputs: r.inputs || {},
    outputs: r.outputs || {},
    dependencies: r.dependencies || [],
    conflicts: r.conflicts || [],
    resources: r.resources || { bundle_kb: 8, cpu_ms: 5, mem_mb: 4 },
    policy: r.policy || { age: "all", license: "MIT", offline_ok: true },
    tests: Array.isArray(r.tests) && r.tests.length ? r.tests : [
      { name: "smoke", input: {}, expect: {} }
    ],
    changelog: r.changelog || ""
  };
}

// 依智慧模組庫四大類別與 capability 前綴推斷（必要時）
function inferCategory(r) {
  const caps = (r.capabilities || []).map(String);
  const text = (caps.join(' ') + ' ' + (r.tags||[]).join(' ') + ' ' + (r.description||'')).toLowerCase();
  if (/(auth|session|storage|queue|scheduler|render|engine|graph|dag)/.test(text)) return "core";
  if (/(io|api|adapter|connector|parser|export|etl|notify|logger)/.test(text)) return "utility";
  if (/(image|audio|video|nlp|creative|design|effect|game|story)/.test(text)) return "creative";
  if (/(payment|invoice|crm|cms|seo|ads|catalog|analytics|report)/.test(text)) return "business";
  return "utility";
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/generate_manifests.cjs registry/registry.ndjson');
    process.exit(1);
  }
  const items = readRegistry(file);
  const outRoot = path.resolve('modules');

  let created = 0, updated = 0;
  for (const r of items) {
    const m = defaultsFromRegistry(r);

    // 草稿/下線：加 __skip_ci
    if (String(r.status || r.state || '').toLowerCase().match(/draft|wip|deprecated|offline/)) {
      m.__skip_ci = true;
    }

    const dir = path.join(outRoot, m.id);
    const out = path.join(dir, 'manifest.json');
    ensureDir(dir);

    const newStr = JSON.stringify(m, null, 2);
    if (fs.existsSync(out)) {
      const oldStr = fs.readFileSync(out, 'utf8');
      if (oldStr !== newStr) {
        fs.writeFileSync(out, newStr);
        updated++;
      }
    } else {
      fs.writeFileSync(out, newStr);
      created++;
    }
  }

  console.log(`✅ generate_manifests done. created=${created} updated=${updated} total=${items.length}`);
}

main();
