import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  return NextResponse.json({ ok: true, module: "mod-<主分類，如-test8-015" });
}
