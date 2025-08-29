#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats').default;

// ---------- 路徑設定 ----------
const REPO_ROOT = path.resolve(__dirname, '..');
const MODULES_DIR = path.join(REPO_ROOT, 'modules');
const SCHEMA_PATH = path.join(REPO_ROOT, 'schema', 'module.manifest.schema.json');
const SUMMARY_PATH = path.join(REPO_ROOT, 'summary.json');

// ---------- 小工具 ----------
const stripBOM = (s) => s.replace(/^\uFEFF/, '');

function posToLineCol(text, pos) {
  // pos 為 0-based 位置；回傳 { line, col } 皆為 1-based
  let line = 1, col = 1;
  for (let i = 0; i < text.length && i < pos; i++) {
    if (text[i] === '\n') {
      line += 1;
      col = 1;
    } else {
      col += 1;
    }
  }
  return { line, col };
}

function walkManifests(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...walkManifests(p));
    else if (name === 'manifest.json') out.push(p);
  }
  return out;
}

function formatAjvErrors(errors) {
  return errors
    .map(e => {
      const inst = e.instancePath || '/';
      const msg = e.message || 'invalid';
      const extra = e.params ? ` | ${JSON.stringify(e.params)}` : '';
      return `  - at ${inst}: ${msg}${extra}`;
    })
    .join('\n');
}

// ---------- 讀入 schema ----------
let schema;
try {
  const schemaText = stripBOM(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  schema = JSON.parse(schemaText);
} catch (e) {
  console.error('❌ 無法讀取/解析 schema：', SCHEMA_PATH);
  console.error(e.message);
  process.exit(1);
}

// ---------- 準備 AJV ----------
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

// ---------- 開始驗證 ----------
const files = walkManifests(MODULES_DIR);

const result = {
  total: files.length,
  valid: 0,
  invalid: 0,
  autofilled: 0, // 保留欄位（若之後有自動補值可遞增）
  failed: [],     // 每個失敗項目：{ file, type: 'json'|'schema', detail }
};

for (const file of files) {
  let text;
  try {
    text = stripBOM(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    result.invalid++;
    result.failed.push({
      file,
      type: 'io',
      detail: `read error: ${e.message}`,
    });
    console.error(`\n❌ 讀檔失敗: ${path.relative(REPO_ROOT, file)}\n  ${e.message}`);
    continue;
  }

  // JSON 解析
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    // 嘗試從錯誤訊息抓 position
    let m = /position\s+(\d+)/i.exec(e.message);
    let lineCol = '';
    if (m) {
      const pos = Number(m[1]);
      const { line, col } = posToLineCol(text, pos);
      lineCol = ` (line ${line} col ${col})`;
    }
    result.invalid++;
    result.failed.push({
      file,
      type: 'json',
      detail: e.message + lineCol,
    });
    console.error(`\n❌ JSON 解析錯誤: ${path.relative(REPO_ROOT, file)}${lineCol}\n  ${e.message}`);
    continue;
  }

  // Schema 驗證
  const ok = validate(data);
  if (!ok) {
    result.invalid++;
    const detail = formatAjvErrors(validate.errors || []);
    result.failed.push({
      file,
      type: 'schema',
      detail,
    });
    console.error(`\n❌ Schema 驗證失敗: ${path.relative(REPO_ROOT, file)}\n${detail}`);
    continue;
  }

  // 驗證通過
  result.valid++;
}

// ---------- Gate（占位：若之後你要做門檻檢查，可在這裡累加） ----------
result.gate = {
  // 示例：若要輸出推估值，可在 build_dag.cjs/auto_select.cjs 內計算後寫 summary
  bundle_kb_max: 500,
  cpu_ms_max: 800,
  mem_mb_max: 120,
  max_degree: 20,
};

// ---------- 輸出 summary ----------
try {
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(result, null, 2) + '\n');
  console.log('\n📄 summary.json 已產生：', path.relative(REPO_ROOT, SUMMARY_PATH));
} catch (e) {
  console.error('⚠️ 無法寫入 summary.json：', e.message);
}

// ---------- 結束碼 ----------
if (result.invalid > 0) {
  console.error(`\n❌ 驗證失敗：${result.invalid}/${result.total} 個 manifest 出錯`);
  process.exit(1);
} else {
  console.log(`\n✅ 全部通過：${result.valid}/${result.total}`);
  process.exit(0);
}
