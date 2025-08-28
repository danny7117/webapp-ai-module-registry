#!/usr/bin/env node
/* scripts/validate_and_fix.cjs
 * Validate & auto-fix modules JSON under ./modules
 * Usage:
 *   node scripts/validate_and_fix.cjs --project="BrandCraft AI"
 * Options:
 *   --project : human readable project name written to tags/source.project
 */

const fs = require('fs');
const path = require('path');

function readEnv() {
  const envPath = path.join(process.cwd(), '.env');
  const out = {};
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) out[m[1]] = m[2];
    }
  }
  return out;
}
const ENV = readEnv();

function slug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function parseJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return { __error: e.message };
  }
}

function writeJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function nowISO() {
  return new Date().toISOString();
}

function ensureCategoryFromFilename(file) {
  const m = file.match(/_(core|utility|creative|business)\.json$/);
  return m ? m[1] : null;
}

function projectKeyFromFilename(file) {
  // brandcraft_modules_core.json -> brandcraft
  const m = path.basename(file).match(/^(.+?)_modules_/);
  return m ? m[1] : 'ugc';
}

function humanProjectNameDefault(key) {
  // small mapping if needed; otherwise title case of key
  return key.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
}

function ensureModuleShape(mod, cat, key, humanProject) {
  const fixed = { ...mod };
  // name
  fixed.name = String(fixed.name || '').trim();
  // category
  fixed.category = fixed.category || cat || 'core';
  // description
  if (fixed.description && typeof fixed.description === 'string') {
    fixed.description = fixed.description.trim();
  }
  // tags
  fixed.tags = Array.isArray(fixed.tags) ? fixed.tags : [];
  if (!fixed.tags.some(t => /^project:/i.test(t))) {
    fixed.tags.push(`project:${humanProject}`);
  }
  fixed.tags = uniq(fixed.tags.map(s => String(s).trim()).filter(Boolean));
  // source
  fixed.source = fixed.source || {};
  fixed.source.project = fixed.source.project || humanProject;
  // owner
  fixed.owner = fixed.owner || ENV.OWNER || 'unknown';
  // status/version
  fixed.status = fixed.status || 'stable';
  fixed.version = fixed.version || '1.0.0';
  // createdAt
  fixed.createdAt = fixed.createdAt || nowISO();
  // id
  if (!fixed.id) {
    const s = slug(fixed.name) || ('mod-' + Math.random().toString(36).slice(2, 8));
    fixed.id = `${key}/${s}`;
  }
  return fixed;
}

function scanModulesDir() {
  const dir = path.join(process.cwd(), 'modules');
  const files = fs.readdirSync(dir)
    .filter(f => /_modules_(all|core|utility|creative|business)\.json$/i.test(f))
    .map(f => path.join(dir, f));
  return files.sort();
}

function summarize(arr) {
  const out = { total: arr.length, core:0, utility:0, creative:0, business:0 };
  for (const m of arr) {
    if (out[m.category] != null) out[m.category] += 1;
  }
  return out;
}

(function main() {
  const args = process.argv.slice(2);
  const argProject = (args.find(a => a.startsWith('--project=')) || '').split('=')[1];

  const files = scanModulesDir();
  if (files.length === 0) {
    console.error('No modules files found under ./modules');
    process.exit(1);
  }

  const bucketsByKey = {}; // key -> { core:[], utility:[], creative:[], business:[] }
  const reports = [];
  const dedupSet = new Set();

  for (const file of files) {
    const data = parseJSON(file);
    if (data.__error) {
      reports.push({ file, error: `JSON parse error: ${data.__error}` });
      continue;
    }
    const key = projectKeyFromFilename(file);
    const humanProject = argProject || ENV.PROJECT || humanProjectNameDefault(key);
    const catFromName = ensureCategoryFromFilename(file);

    const fixed = [];
    for (const raw of data) {
      const m = ensureModuleShape(raw, catFromName, key, humanProject);
      // dedup by id
      let id = m.id;
      let tries = 1;
      while (dedupSet.has(id)) {
        tries++;
        id = `${m.id}-v${tries}`;
      }
      if (id !== m.id) m.id = id;
      dedupSet.add(m.id);
      fixed.push(m);
    }

    // put into buckets by key and category
    const bk = bucketsByKey[key] || (bucketsByKey[key] = { core:[], utility:[], creative:[], business:[] });
    if (catFromName) {
      bk[catFromName].push(...fixed);
    } else {
      // unknown -> 分派到其 m.category
      for (const m of fixed) {
        if (bk[m.category]) bk[m.category].push(m);
        else bk.core.push(m);
      }
    }

    // 覆寫當前檔案（修補後）
    writeJSON(file, fixed);
  }

  // 依 key 重建 *_modules_all.json + registry
  const registry = [];
  for (const [key, cats] of Object.entries(bucketsByKey)) {
    const dir = path.join(process.cwd(), 'modules');
    const allFile = path.join(dir, `${key}_modules_all.json`);
    const allArr = [...cats.core, ...cats.utility, ...cats.creative, ...cats.business];
    writeJSON(allFile, allArr);

    const summary = {
      key,
      counts: {
        core: cats.core.length,
        utility: cats.utility.length,
        creative: cats.creative.length,
        business: cats.business.length,
        all: allArr.length,
      }
    };
    registry.push(summary);
  }

  // modules/registry.json（全體摘要）
  writeJSON(path.join(process.cwd(), 'modules', 'registry.json'), {
    generatedAt: nowISO(),
    projects: registry
  });

  // console 報表
  console.log('==== Validate & Fix Report ====');
  for (const r of registry) {
    console.log(
      `${r.key}: all=${r.counts.all} ` +
      `(core=${r.counts.core}, utility=${r.counts.utility}, creative=${r.counts.creative}, business=${r.counts.business})`
    );
  }
  if (reports.length) {
    console.log('\nErrors:');
    for (const e of reports) console.log('-', e.file, '=>', e.error);
    process.exitCode = 1;
  } else {
    console.log('\nOK: all files fixed & summarized.');
  }
})();
