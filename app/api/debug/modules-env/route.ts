// app/api/debug/modules-env/route.ts
import { NextResponse } from 'next/server';
export async function GET() {
  const env = {
    MODULES_SEARCH_URL: process.env.MODULES_SEARCH_URL ?? null,
    MODULES_INDEX_URL: process.env.MODULES_INDEX_URL ?? null,
    MODULES_GROUPS: process.env.MODULES_GROUPS ?? null,
  };
  return NextResponse.json(env, { headers: { 'Cache-Control': 'no-store' } });
}
