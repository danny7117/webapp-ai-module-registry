import { NextResponse } from 'next/server';

type CatalogGroup = { id: string; title?: string; path: string };
type Catalog = { version: string; groups: CatalogGroup[] };
type ModuleDef = { id: string; name?: string; tags?: string[]; [k: string]: any };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').toLowerCase().trim();

  const indexUrl = process.env.MODULES_INDEX_URL;
  if (!indexUrl) {
    return NextResponse.json({ items: [], error: 'MODULES_INDEX_URL not set' }, { status: 500 });
  }

  // 讀 catalog（不使用快取，確保拿到最新）
  const catalogRes = await fetch(indexUrl, { cache: 'no-store' });
  if (!catalogRes.ok) {
    return NextResponse.json({ items: [], error: 'fetch catalog failed' }, { status: 502 });
  }
  const catalog: Catalog = await catalogRes.json();

  // 白名單：從環境變數讀；若沒設，預設載入四個群組（含 cryptopark_all）
  const groupsEnv =
    process.env.MODULES_GROUPS ||
    'brandcraft_all,crawler_all,cardbattle_all,cryptopark_all';
  const allow = new Set(
    groupsEnv.split(',').map((s) => s.trim()).filter(Boolean)
  );

  // 算出 RAW 的 base 路徑（移除 query 與 catalog.json 檔名）
  const u = new URL(indexUrl);
  u.search = '';
  const base = u.toString().replace(/catalog\.json$/, '');

  // 逐群組讀入模組
  const all: ModuleDef[] = [];
  for (const g of catalog.groups || []) {
    if (!allow.has(g.id)) continue;
    const groupUrl = new URL(g.path, base).toString();
    const r = await fetch(groupUrl, { cache: 'no-store' });
    if (!r.ok) continue;
    const gj = await r.json();
    const list: ModuleDef[] = Array.isArray(gj?.modules) ? gj.modules : [];
    for (const m of list) {
      all.push({ ...m, _group: g.id });
    }
  }

  // 關鍵字過濾（id/name/tags）
  const items = all.filter((m) => {
    if (!q) return true;
    const name = String(m.name || '').toLowerCase();
    const id = String(m.id || '').toLowerCase();
    const tags: string[] = Array.isArray(m.tags) ? m.tags.map(String) : [];
    return (
      id.includes(q) ||
      name.includes(q) ||
      tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return NextResponse.json({ items });
}
