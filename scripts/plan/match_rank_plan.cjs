// 假設有一個請求 payload，包含 user需求、約束、資源
function match(modules, request) {
  // 簡化：用 capabilities 相交判斷
  return modules.filter(m => (m.capabilities || []).some(c => request.needCaps.includes(c)));
}
function rank(candidates, request) {
  // 簡化：按版本新 → 與 tags 匹配度排序
  return candidates
    .map(m => ({ m, score: (m.tags||[]).filter(t=>request.tags.includes(t)).length }))
    .sort((a,b)=> b.score - a.score)
    .map(x => x.m);
}
function plan(ranked, request, graph) {
  // 依 DAG 決定順序；這裡放簡化版：直接取 Top-N
  return ranked.slice(0, request.topN || 3).map(m => m.id);
}
module.exports = { match, rank, plan };
