const buildGraphAndCheck = (manifests) => {
  const graph = new Map(); // id -> deps array
  const set = new Set(manifests.map(m => m.json.id));
  for (const m of manifests) {
    const deps = m.json.dependencies || [];
    graph.set(m.json.id, deps.filter(d => set.has(d)));
    // 互斥：自我互斥或互斥對象存在於同批變更，可在此檢查
    const conflicts = m.json.conflicts || [];
    for (const c of conflicts) {
      if (set.has(c)) throw new Error(`Conflict: ${m.json.id} conflicts with ${c}`);
    }
  }
  // cycle 檢查
  const visited = new Set(), stack = new Set();
  const dfs = (u) => {
    visited.add(u); stack.add(u);
    for (const v of graph.get(u) || []) {
      if (!visited.has(v)) dfs(v);
      else if (stack.has(v)) throw new Error(`Dependency cycle: ${u} -> ${v}`);
    }
    stack.delete(u);
  };
  for (const u of graph.keys()) if (!visited.has(u)) dfs(u);
  return graph;
};
module.exports = { buildGraphAndCheck };
