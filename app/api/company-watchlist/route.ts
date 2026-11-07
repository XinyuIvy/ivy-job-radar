import { NextResponse } from "next/server";
import { getD1 } from "../../../db";
import { getChatGPTUser } from "../../chatgpt-auth";
import seed from "../../company-watchlist-seed.json";
import researchPositions from "../../company-watchlist-2027-positions.json";
import scanSeed from "../../company-scan-status.json";
import { ensureWatchlist, initializeWatchlist, importResearchPositions, listWatchedCompanies, saveWatchedCompany, deleteWatchedCompany, syncWatchlistScanResults } from "../../lib/company-watchlist-store";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "不允许跨站修改。" }, { status: 403 });
  }
  try {
    const db = await getD1();
    await ensureWatchlist(db);
    if (request.method === "POST" || request.method === "PUT") {
      const body = await request.json();
      if (request.method === "POST" && body?.action === "initialize") {
        await initializeWatchlist(db, user.email, seed);
        await importResearchPositions(db, user.email, researchPositions);
        await syncWatchlistScanResults(db, user.email, scanSeed);
      }
      else {
        if (request.method === "PUT" && (typeof body?.id !== "string" || !body.id || body.id.length > 100)) throw new Error("缺少记录编号。");
        await saveWatchedCompany(db, user.email, body, request.method === "PUT" ? body.id : undefined);
      }
    }
    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id");
      if (!id || id.length > 100) throw new Error("缺少记录编号。");
      await deleteWatchedCompany(db, user.email, id);
    }
    return NextResponse.json({ companies: await listWatchedCompanies(db, user.email), monitoringEnabled: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    const validation = /^(请|公司|每家|链接|只支持|这家公司|记录不存在|缺少)/.test(message);
    return NextResponse.json({ error: validation ? message : "保存或读取失败，请稍后重试。" }, { status: validation ? 400 : 500 });
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
