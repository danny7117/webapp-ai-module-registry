// scripts/split_by_category.cjs
const fs = require('fs');
const path = require('path');

const MOD_DIR = path.resolve('modules');
const ALL = path.join(MOD_DIR, 'modules_all.json');
const OUT = {
  core:     path.join(MOD_DIR, 'modules_core.json'),
  utility:  path.join(MOD_DIR, 'modules_utility.json'),
  creative: path.join(MOD_DIR, 'modules_creative.json'),
  business: path.join(MOD_DIR, 'modules_business.json'),
};

const all = JSON.parse(fs.readFileSync(ALL, 'utf8'));

const buckets = { core:[], utility:[], creative:[], business:[] };
for (const m of all) {
  const cat = String(m.category||'').toLowerCase();
  if (buckets[cat]) buckets[cat].push(m);
}

for (const k of Object.keys(OUT)) {
  fs.writeFileSync(OUT[k], JSON.stringify(buckets[k], null, 2));
  console.log(`${k}: ${buckets[k].length}`);
}
console.log('done.');
