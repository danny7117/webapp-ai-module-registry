// registry.js
const fs = require('fs');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const BASE = process.env.REGISTRY_BASE || 'https://raw.githubusercontent.com/danny7117/webapp-ai-module-registry/main/modules';
const CACHE_DIR = process.env.REGISTRY_CACHE_DIR || path.join(process.cwd(), 'data', 'registry-cache');
const FILES = [
  'modules_all.json',
  'modules_core.json',
  'modules_utility.json',
  'modules_creative.json',
  'modules_business.json',
];

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, {recursive: true}); }
ensureDir(CACHE_DIR);

async function downloadOne(name) {
  const url = `${BASE}/${name}`;
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' }});
  if (!res.ok) throw new Error(`Fetch ${name} failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  // 驗證 JSON
  JSON.parse(text);
  const file = path.join(CACHE_DIR, name);
  fs.writeFileSync(file, text);
  return file;
}

async function refreshAll() {
  const results = [];
  for (const f of FILES) {
    const p = await downloadOne(f);
    results.push(p);
  }
  return results;
}

function readJsonLocal(name) {
  const p = path.join(CACHE_DIR, name);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}

function getAll() { return readJsonLocal('modules_all.json'); }
function getByCategory(cat) {
  cat = String(cat || '').toLowerCase();
  const map = {
    core: 'modules_core.json',
    utility: 'modules_utility.json',
    creative: 'modules_creative.json',
    business: 'modules_business.json',
  };
  const file = map[cat] || 'modules_all.json';
  return readJsonLocal(file);
}

module.exports = { refreshAll, getAll, getByCategory };
