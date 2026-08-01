import { NextResponse } from "next/server";

import { getChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  const { env } = await import("cloudflare:workers");
  const syncToken = String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim();
  const sitesBypassToken = String(env.IVY_JOB_RADAR_SITES_BYPASS_TOKEN ?? "").trim();
  if (!syncToken || !sitesBypassToken) {
    return NextResponse.json({ error: "The local collector is not configured." }, { status: 503 });
  }

  const body = [
    "# Keep this file private. It allows the local collector to import jobs.",
    "IVY_JOB_RADAR_URL=https://ivy-job-radar.rourou1199.chatgpt.site",
    `IVY_JOB_RADAR_SYNC_TOKEN=${syncToken}`,
    `IVY_JOB_RADAR_SITES_BYPASS_TOKEN=${sitesBypassToken}`,
    "",
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="collector.env"',
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
