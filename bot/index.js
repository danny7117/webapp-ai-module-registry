// bot/index.js
import 'dotenv/config';
import express from 'express';
import { Octokit } from '@octokit/rest';

const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  CATEGORY_WHITELIST = 'content,ui,data,system',
  PORT = 8787
} = process.env;

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error('[module-proposal-bot] Missing env: GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '1mb' }));

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const whitelist = CATEGORY_WHITELIST.split(',').map(s => s.trim()).filter(Boolean);
const CAT_PREFIX = 'cat:';
const MODULE_LABEL = 'module:proposal';

/** 確保指定的 Label 存在；若不存在則建立 */
async function ensureLabel(name, color = '116cf1', description = '') {
  try {
    await octokit.issues.getLabel({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      name
    });
    return;
  } catch (err) {
    // not found → create
    try {
      await octokit.issues.createLabel({
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
        name,
        color,
        description
      });
      console.log(`[labels] created: ${name}`);
    } catch (e) {
      // already exists (race) or permission
      if (e.status !== 422) throw e;
    }
  }
}

/** 啟動時先確保所有分類標籤與 module:proposal 存在 */
async function ensureAllLabels() {
  await ensureLabel(MODULE_LABEL, '6f42c1', 'Module proposal auto-scaffold trigger');
  for (const cat of whitelist) {
    await ensureLabel(`${CAT_PREFIX}${cat}`, '3fb950', `分類：${cat}`);
  }
}

/** 製作 Issue body（固定模板） */
function buildIssueBody(payload) {
  const {
    title = '',
    category = '',
    summary = '',
    problem = '',
    inputs = '',
    outputs = '',
    constraints = ''
  } = payload || {};

  return [
    'name: 模組提案 Module Proposal',
    'about: 一段文字，會由系統自動生成模組骨架',
    'title: "[Module] 請輸入模組名稱"',
    '',
    '---',
    '',
    `category: "${category || 'ui'}"`,
    `summary: "${summary || '請填寫 1~2 句概述'}"`,
    '',
    'problem: |',
    `  ${problem || '要解決的問題描述'}`,
    '',
    'inputs: |',
    `  ${inputs || '輸入 JSON 描述（可留白）'}`,
    '',
    'outputs: |',
    `  ${outputs || '輸出 JSON 描述（可留白）'}`,
    '',
    'constraints: |',
    `  ${constraints || '限制 / 成本 / 注意事項（可留白）'}`
  ].join('\n');
}

/** 建 Issue 的核心邏輯 */
async function createModuleProposal(payload) {
  // 1) 驗證/正規化分類
  const rawCat = (payload.category || '').trim().toLowerCase();
  const category = whitelist.includes(rawCat) ? rawCat : 'ui';
  const catLabel = `${CAT_PREFIX}${category}`;

  // 2) 準備標籤
  const labels = [MODULE_LABEL, catLabel];

  // 3) 標題（必填）；若前端沒給，幫他補個安全預設
  let title = (payload.title || '').trim();
  if (!title) title = '未命名模組';

  // 4) Issue body（固定模板）
  const body = buildIssueBody({ ...payload, category });

  // 5) 建立 Issue
  const res = await octokit.issues.create({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    title: `[Module] ${title}`,
    body,
    labels
  });

  return res.data;
}

/** 健康檢查 */
app.get('/health', (req, res) => {
  res.json({ ok: true, repo: `${GITHUB_OWNER}/${GITHUB_REPO}`, categories: whitelist });
});

/**
 * 入口：由 GPT 或你的後端 POST 到這裡
 * 例：
 * POST /issue
 * {
 *   "title": "品牌圖庫批次上架",
 *   "category": "content",
 *   "summary": "上傳 CSV 一鍵生成 200 張圖與分享連結",
 *   "problem": "...",
 *   "inputs": "...",
 *   "outputs": "...",
 *   "constraints": "..."
 * }
 */
app.post('/issue', async (req, res) => {
  try {
    const payload = req.body || {};

    // 啟動前先確保標籤存在（第一次呼叫或標籤被人刪掉時）
    await ensureAllLabels();

    const issue = await createModuleProposal(payload);
    res.json({
      ok: true,
      issue_number: issue.number,
      issue_url: issue.html_url
    });
  } catch (err) {
    console.error('[create-issue] error:', err);
    res.status(500).json({ ok: false, error: err.message || 'internal_error' });
  }
});

app.listen(PORT, () => {
  console.log(`[module-proposal-bot] listening on :${PORT}`);
});
