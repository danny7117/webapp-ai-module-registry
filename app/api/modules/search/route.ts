// app/api/modules/search/route.ts
import { NextResponse } from 'next/server';

type ModuleLite = { id: string; name: string; tags?: string[]; [k: string]: any };
type CatalogGroup = { id: string; title: string; path: string; count?: number; checksum?: string };
type Catalog = { version: string; groups: CatalogGroup[] };

const UA = 'CIP-Modules/1.0 (+vercel)';

// fetch JSON with no cache + UA
async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    cache: 'no-store', // 重要：避免讀到舊快取
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

// 方案 A：Proxy 你的智慧模組庫（如果有設 MODULES_SEARCH_URL 就走這條）
async function proxyYourLibrary(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? '';
  const limit = url.searchParams.get('limit') ?? '10';
  const base = process.env.MODULES_SEARCH_URL!;
  const target = `${base}?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`;
  const data = await fetchJSON<any>(target);
  // 直接原樣回傳（或轉成固定格式也行）
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}

// 方案 B：讀 GitHub catalog.json
async function fromCatalog(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').toLowerCase().trim();
  const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);

  const indexUrl = process.env.MODULES_INDEX_URL; // 例：https://raw.githubusercontent.com/xxx/webapp-ai-module-registry/main/modules/catalog.json?v=...
  const groupsEnv = process.env.MODULES_GROUPS ?? ''; // 例：brandcraft_all,crawler_all,cardbattle_all,cryptopark_all
  if (!indexUrl) return NextResponse.json({ items: [], reason: 'MODULES_INDEX_URL not set' });

  const wanted = new Set(
    groupsEnv
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

  // 1) 讀 catalog
  const catalog = await fetchJSON<Catalog>(indexUrl);

  // 2) 只取設定的 groups（若沒設，全部取）
  const groups = catalog.groups.filter((g) => (wanted.size ? wanted.has(g.id) : true));

  // 3) 讀每個 group 的模組檔（允許兩種格式：純 array 或 {modules:[...] }）
  const all: ModuleLite[] = [];
  const base = new URL(indexUrl);
  const baseRoot = `${base.origin}${base.pathname}`.replace(/\/[^/]+$/, '/'); // 轉成 .../modules/
  for (const g of groups) {
    const groupUrl = g.path.startsWith('http') ? g.path : baseRoot + g.path;
    try {
      const raw = await fetchJSON<any>(groupUrl);
      const mods: ModuleLite[] = Array.isArray(raw) ? raw : Array.isArray(raw?.modules) ? raw.modules : [];
      all.push(...mods);
    } catch (e) {
      // 讀不到就跳過
    }
  }

  // 4) 搜尋（id/name/tags）
  const items = (q
    ? all.filter((m) => {
        const hay = `${m.id ?? ''} ${m.name ?? ''} ${(m.tags ?? []).join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
    : all
  ).slice(0, isFinite(limit) ? limit : 10);

  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(req: Request) {
  try {
    if (process.env.MODULES_SEARCH_URL) {
      return await proxyYourLibrary(req); // 方案 A（你的庫）
    }
    return await fromCatalog(req); // 方案 B（catalog.json）
  } catch (err: any) {
    return NextResponse.json({ items: [], error: String(err?.message ?? err) }, { status: 500 });
  }
}
