// scripts/validate_modules.cjs
'use strict';

const fs = require('fs');
const path = require('path');

const AjvLib = require('ajv');
const Ajv = AjvLib.default || AjvLib;         // 相容不同安裝型態
const addFormats = require('ajv-formats');

const REPO_ROOT     = path.resolve(__dirname, '..');
const MODULES_DIR   = path.join(REPO_ROOT, 'modules');
const SCHEMA_FILE   = path.join(REPO_ROOT, 'schema', 'module.manifest.schema.json');
const SUMMARY_PATH  = path.join(REPO_ROOT, 'summary.json');

function listManifests(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return fs.statSync(p).isDirectory() ? listManifests(p) : [p];
  }).filter(f => f.endsWith('manifest.json'));
}

function safeJSONParse(text) {
  try {
    return { data: JSON.parse(text.replace(/^\uFEFF/, '')), error: null }; // 去 BOM 再 parse
  } catch (error) {
    return { data: null, error };
  }
}

function loadSchema() {
  const raw = fs.readFileSync(SCHEMA_FILE, 'utf8').replace(/^\uFEFF/, '');
  const { data, error } = safeJSONParse(raw);
  if (error) {
    console.error('❌ Schema 解析失敗：', error.message);
    process.exit(1);
  }
  return data;
}

function createAjv() {
  const ajv = new Ajv({
    strict: false,           // 放寬，避免草稿嚴格報錯
    allErrors: true,
    allowUnionTypes: true
  });
  try { addFormats(ajv); } catch (_) {}
  return ajv;
}

function validateAll() {
  const schema = loadSchema();
  const ajv = createAjv();
  const validate = ajv.compile(schema);

  const files = listManifests(MODULES_DIR);

  const result = {
    total: files.length,
    valid: 0,
    invalid: 0,
    autofilled: 0,           // 這裡先保留欄位，未來要自動補欄位可在此統計
    failed: [],              // 詳細錯誤清單
  };

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const { data, error } = safeJSONParse(raw);
    if (error) {
      result.invalid++;
      result.failed.push({
        file: path.relative(REPO_ROOT, file),
        reason: 'JSON parse error',
        message: error.message
      });
      continue;
    }

    const ok = validate(data);
    if (!ok) {
      result.invalid++;
      result.failed.push({
        file: path.relative(REPO_ROOT, file),
        reason: 'schema validation error',
        errors: validate.errors
      });
    } else {
      result.valid++;
    }
  }

  // 輸出 summary.json
  try {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(result, null, 2) + '\n');
    console.log(`📝 已產生 ${path.relative(REPO_ROOT, SUMMARY_PATH)} 。`);
  } catch (e) {
    console.error('❌ 無法寫入 summary.json：', e.message);
    // 不中斷，讓你至少看到統計
  }

  // 終端顯示摘要
  console.log('\n===== Validation Summary =====');
  console.log(`total    : ${result.total}`);
  console.log(`valid    : ${result.valid}`);
  console.log(`invalid  : ${result.invalid}`);
  console.log(`autofilled: ${result.autofilled}`);
  if (result.failed.length > 0) {
    console.log('\n--- 失敗清單（前 50 筆） ---');
    result.failed.slice(0, 50).forEach((f, i) => {
      console.log(`${i+1}. ${f.file}`);
      console.log(`   ↳ ${f.reason}`);
      if (f.message) console.log(`   ↳ ${f.message}`);
      if (f.errors)  console.log(`   ↳ ${JSON.stringify(f.errors, null, 2)}`);
    });
  }
  console.log('==============================\n');

  // 有錯讓退出碼為 1（CI/本地都能看見失敗），沒錯回 0
  process.exit(result.invalid === 0 ? 0 : 1);
}

// 執行
validateAll();
