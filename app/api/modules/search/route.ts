// app/api/modules/search/route.ts
import { NextResponse } from 'next/server';

type Group = { id: string; path: string; title?: string };
type Catalog = { version?: string; groups: Group[] };
type Mod = { id?: string; name?: string; tags?: string[]; [k: string]: any };

const UA = 'CIP-Modules/1.0';

async function j<T>(url: string) {
  const r = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`fetch ${url} ${r.status}`);
  return r.json() as Promise<T>;
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const q = (u.searchParams.get('q') || '').toLowerCase().trim();
    const limit = Number(u.searchParams.get('limit') || 20);

    // 先試 Proxy（如果你之後要「雙通道」）
    const proxy = process.env.MODULES_SEARCH_URL;
    const timeout = Number(process.env.SEARCH_TIMEOUT_MS || 1500);
    if (proxy) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeout);
        const r = await fetch(`${proxy}?q=${encodeURIComponent(q)}&limit=${limit}`, {
          signal: ctrl.signal,
          headers: { 'User-Agent': UA, 'x-auth': process.env.SEARCH_AUTH_KEY || '' },
          cache: 'no-store',
        });
        clearTimeout(t);
        if (r.ok) {
          const data = await r.json();
          return NextResponse.json(data, { headers: { 'x-source': 'proxy' } });
        }
      } catch { /* 失敗就回退 */ }
    }

    // 回退：讀 GitHub catalog.json
    const indexUrl = process.env.MODULES_INDEX_URL;
    if (!indexUrl) return NextResponse.json({ items: [], error: 'MODULES_INDEX_URL not set' }, { status: 500 });

    const catalog = await j<Catalog>(indexUrl);
    const allowed = new Set(
      (process.env.MODULES_GROUPS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );

    // 允許清單有設就只取允許；沒設就全取（← 保證 cryptopark_all 會吃到）
    const groups = (catalog.groups || []).filter(g => (allowed.size ? allowed.has(g.id) : true));

    // 拼出 RAW base
    const idx = new URL(indexUrl); idx.search = '';
    const base = idx.toString().replace(/\/[^/]+$/, '/');

    // 拉每個 group 的模組
    const all: Mod[] = [];
    for (const g of groups) {
      const url = g.path.startsWith('http') ? g.path : base + g.path;
      try {
        const gj = await j<any>(url);
        const arr: Mod[] = Array.isArray(gj) ? gj : Array.isArray(gj?.modules) ? gj.modules : [];
        all.push(...arr);
      } catch { /* 略過錯組 */ }
    }

    const term = q;
    const items = (term
      ? all.filter(m => {
          const s = `${m.id || ''} ${m.name || ''} ${(m.tags || []).join(' ')}`.toLowerCase();
          return s.includes(term);
        })
      : all).slice(0, isFinite(limit) ? limit : 20);

    return NextResponse.json({ items }, { headers: { 'x-source': 'catalog' } });
  } catch (e: any) {
    return NextResponse.json({ items: [], error: String(e?.message || e) }, { status: 500 });
  }
}
