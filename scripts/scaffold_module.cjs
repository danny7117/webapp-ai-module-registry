// scripts/scaffold_module.cjs
const fs = require('fs');
const path = require('path');

function readEnv(name, def = '') {
  return process.env[name] ?? def;
}

const ISSUE_NUMBER = readEnv('ISSUE_NUMBER');
const ISSUE_TITLE  = readEnv('ISSUE_TITLE');
const ISSUE_BODY   = readEnv('ISSUE_BODY', '');
const ISSUE_LABELS = (() => {
  try { return JSON.parse(readEnv('ISSUE_LABELS', '[]')); } catch { return []; }
})();

function ensureJson(file, fallback) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  const raw = fs.readFileSync(file, 'utf8');
  try { return JSON.parse(raw || '[]'); } catch { return fallback; }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function extractFirstJsonBlock(md = '') {
  const re = /```json\s*([\s\S]*?)\s*```/i;
  const m = re.exec(md);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

function inferCategory(labels = [], fallback = 'utility') {
  const cat = labels.find(n =>
    /^category:\s*(core|utility|creative|business)$/i.test(n)
  );
  if (cat) return cat.split(':')[1].trim().toLowerCase();
  const short = labels.find(n => /^(core|utility|creative|business)$/i.test(n));
  if (short) return short.toLowerCase();
  // 標籤本身也可以決定：ready/proposal 都給 utility 預設
  return (fallback || 'utility').toLowerCase();
}

function inferNameFromTitle(t = '') {
  const s = t.trim();
  if (/^module:\s*/i.test(s)) return s.replace(/^module:\s*/i, '').trim();
  if (/^\[module\]\s*/i.test(s)) return s.replace(/^\[module\]\s*/i, '').trim();
  return s;
}

function firstLine(text = '') {
  return (text.split(/\r?\n/).map(x => x.trim()).filter(Boolean)[0]) || '';
}

function uniqueById(list) {
  const seen = new Set();
  return list.filter(x => (x.id && !seen.has(x.id)) ? seen.add(x.id) : !x.id);
}

// ---- 讀現有檔案 ----
const base = path.resolve('modules');
const files = {
  all: path.join(base, 'modules_all.json'),
  core: path.join(base, 'modules_core.json'),
  utility: path.join(base, 'modules_utility.json'),
  creative: path.join(base, 'modules_creative.json'),
  business: path.join(base, 'modules_business.json'),
};

const all = ensureJson(files.all, []);
const core = ensureJson(files.core, []);
const utility = ensureJson(files.utility, []);
const creative = ensureJson(files.creative, []);
const business = ensureJson(files.business, []);

// ---- 解析 Issue → 模組 ----
const payload = extractFirstJsonBlock(ISSUE_BODY) || {};
const labels = ISSUE_LABELS || [];

const moduleObj = {
  id: payload.id || payload.module_id || `ISSUE-${ISSUE_NUMBER}`,
  name: payload.name || inferNameFromTitle(ISSUE_TITLE),
  category: (payload.category || inferCategory(labels)).toLowerCase(),
  desc: payload.desc || firstLine(ISSUE_BODY),
  source: {
    issue_number: Number(ISSUE_NUMBER),
    issue_url: `https://github.com/${process.env.GITHUB_REPOSITORY}/issues/${ISSUE_NUMBER}`
  }
};

// ---- 寫回 all.json（去重）----
const updatedAll = uniqueById(
  [moduleObj].concat(all.filter(x => x.id !== moduleObj.id))
);
writeJson(files.all, updatedAll);

// ---- 同步分類檔 ----
const buckets = { core, utility, creative, business };
for (const k of Object.keys(buckets)) {
  // 先移除舊同 id
  const arr = buckets[k].filter(x => x.id !== moduleObj.id);
  // 再決定是否加入本次
  if (moduleObj.category === k) arr.unshift(moduleObj);
  writeJson(files[k], arr);
}

console.log(`Scaffolded module id=${moduleObj.id} category=${moduleObj.category}`);
