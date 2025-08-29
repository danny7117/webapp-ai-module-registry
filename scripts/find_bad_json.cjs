'use strict';
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'modules');

function walk(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return fs.statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(BASE).filter(f => f.endsWith('manifest.json'));

let bad = [];
for (const f of files) {
  try {
    const raw = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
    JSON.parse(raw);
  } catch (e) {
    bad.push({
      file: path.relative(path.join(__dirname, '..'), f),
      message: e.message
    });
  }
}

if (bad.length === 0) {
  console.log('✅ 所有 manifest.json 都能正確解析');
  process.exit(0);
} else {
  console.log('❌ 發現無法解析的 manifest.json：\n');
  for (const b of bad) {
    console.log(`- ${b.file}`);
    console.log(`  ↳ ${b.message}\n`);
  }
  process.exit(1);
}
