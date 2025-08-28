// scripts/validate_and_fix.cjs
// 目的：一次性檢查與修補 BrandCraft modules：id / slug / tags / source / project
// 使用：node scripts/validate_and_fix.cjs --project="BrandCraft AI" --source=import-2025-08-28

import fs from "fs";
import path from "path";
import crypto from "crypto";

const MOD_DIR = "modules";
const FILES = {
  all:        "brandcraft_modules_all.json",
  core:       "brandcraft_modules_core.json",
  utility:    "brandcraft_modules_utility.json",
  creative:   "brandcraft_modules_creative.json",
  business:   "brandcraft_modules_business.json",
};
const REGISTRY = "registry.json";

// 讀 CLI 參數
const args = Object.fromEntries(
  process.argv.slice(2).map(s => {
    const m = s.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [s.replace(/^--/, ""), true];
  })
);
const PROJECT = args.project || "BrandCraft AI";
const SOURCE  = args.source  || "import";

// 小工具
const readJSON = p => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJSON = (p, data) =>
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");

const slugify = s =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

const makeId = name => {
  const base = slugify(name) || "mod";
  const rand = crypto.randomBytes(3).toString("hex");
  return `${base}-${rand}`;
};

const ensureArray = v => (Array.isArray(v) ? v : v ? [v] : []);

const fixOne = (m) => {
  // id
  if (!m.id || typeof m.id !== "string" || !m.id.trim()) {
    m.id = makeId(m.name || m.title || "module");
  }

  // slug
  if (!m.slug) m.slug = slugify(m.name || m.title || m.id);

  // project / source
  if (!m.project) m.project = PROJECT;
  if (!m.source)  m.source  = SOURCE;

  // tags：至少放入 project, source, category
  const tags = new Set(ensureArray(m.tags));
  tags.add(`project:${slugify(PROJECT)}`);
  tags.add(`source:${slugify(SOURCE)}`);
  if (m.category) tags.add(`category:${String(m.category).toLowerCase()}`);
  m.tags = Array.from(tags);

  // 確保必要欄位存在
  if (!m.name)  m.name  = m.title || m.slug || m.id;
  if (!m.title) m.title = m.name;

  return m;
};

const fixList = (arr, cat) => arr.map(x => fixOne({ ...x, category: cat }));

// 讀檔
const pAll      = path.join(MOD_DIR, FILES.all);
const pCore     = path.join(MOD_DIR, FILES.core);
const pUtil     = path.join(MOD_DIR, FILES.utility);
const pCreative = path.join(MOD_DIR, FILES.creative);
const pBiz      = path.join(MOD_DIR, FILES.business);

const all      = readJSON(pAll);
const core     = readJSON(pCore);
const utility  = readJSON(pUtil);
const creative = readJSON(pCreative);
const business = readJSON(pBiz);

// 逐類別修補
const fixed = {
  core:     fixList(core,     "core"),
  utility:  fixList(utility,  "utility"),
  creative: fixList(creative, "creative"),
  business: fixList(business, "business"),
};
const allMap = new Map();
for (const cat of ["core","utility","creative","business"]) {
  for (const m of fixed[cat]) allMap.set(m.id, m);
}
// 以類別合併為 all；若 all 原本有其他欄位，仍以修補後覆蓋
for (const m of all) {
  const fixedOne = fixOne(m);
  allMap.set(fixedOne.id, fixedOne);
}
const mergedAll = Array.from(allMap.values());

// registry.json：只更新 BrandCraft 的入口，其他專案不動
const regPath = path.join(MOD_DIR, REGISTRY);
let registry = fs.existsSync(regPath) ? readJSON(regPath) : { modules: [] };

// 建立/更新 BrandCraft 區段
const regIdx = registry.modules.findIndex(x => x && x.name === "BrandCraft AI");
const regEntry = {
  name: "BrandCraft AI",
  slug: "brandcraft-ai",
  files: Object.values(FILES),
  count: {
    all: mergedAll.length,
    core: fixed.core.length,
    utility: fixed.utility.length,
    creative: fixed.creative.length,
    business: fixed.business.length
  },
  updatedAt: new Date().toISOString()
};
if (regIdx >= 0) registry.modules[regIdx] = regEntry;
else registry.modules.push(regEntry);

// 寫回
writeJSON(pAll,      mergedAll);
writeJSON(pCore,     fixed.core);
writeJSON(pUtil,     fixed.utility);
writeJSON(pCreative, fixed.creative);
writeJSON(pBiz,      fixed.business);
writeJSON(regPath,   registry);

// 簡報
console.log("[OK] fixed BrandCraft modules");
console.log(regEntry.count);
