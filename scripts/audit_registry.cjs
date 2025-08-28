// scripts/audit_registry.cjs
const fs = require('fs');
const path = require('path');

function readRegistry(file) {
  const ext = path.extname(file).toLowerCase();
  const raw = fs.readFileSync(file, 'utf8');
  if (ext === '.ndjson' || ext === '.ndj') {
    return raw.trim().split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
  }
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : data.items || [];
}

function readRepo() {
  const base = path.resolve('modules');
  const list = {};
  if (!fs.existsSync(base)) return list;
  for (const id of fs.readdirSync(base)) {
    if (id === '_drafts') continue;
    const mf = path.join(base, id, 'manifest.json');
    if (fs.existsSync(mf)) {
      try { list[id] = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch {}
    }
  }
  return list;
}

function pickCore(m) {
  const x = {};
  for (const k of ["id","name","version","category","capabilities","inputs","outputs","resources","policy"]) {
    x[k] = m?.[k];
  }
  return x;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/audit_registry.cjs registry/registry.ndjson');
    process.exit(1);
  }
  const R = readRegistry(file);
  const repo = readRepo();

  const regMap = new Map(R.map(r => [String(r.id||r.module_id||r.code), r]));
  const repoIds = new Set(Object.keys(repo));

  const onlyInRegistry = [];
  const onlyInRepo = [];
  const diffFields = [];

  for (const [id, r] of regMap.entries()) {
    if (!repoIds.has(id)) {
      onlyInRegistry.push(id);
    } else {
      const a = pickCore(repo[id]);
      const b = pickCore({
        id: id,
        name: r.name || r.title || id,
        version: r.version || '1.0.0',
        category: String(r.category||'').toLowerCase(),
        capabilities: r.capabilities || [r.capability || `${id}.basic`],
        inputs: r.inputs || {},
        outputs: r.outputs || {},
        resources: r.resources || { bundle_kb: 8, cpu_ms: 5, mem_mb: 4 },
        policy: r.policy || { age: "all", license: "MIT", offline_ok: true }
      });
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        diffFields.push(id);
      }
      repoIds.delete(id);
    }
  }
  onlyInRepo.push(...repoIds);

  console.log('=== Audit Report ===');
  console.log('Only in Registry (need gen):', onlyInRegistry.length);
  if (onlyInRegistry.length) console.log(onlyInRegistry.slice(0,50));

  console.log('Only in Repo (maybe legacy):', onlyInRepo.length);
  if (onlyInRepo.length) console.log(onlyInRepo.slice(0,50));

  console.log('Field mismatch (need re-gen):', diffFields.length);
  if (diffFields.length) console.log(diffFields.slice(0,50));
}

main();
