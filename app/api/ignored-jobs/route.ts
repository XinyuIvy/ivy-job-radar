import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { ignoredJobs, jobs } from "../../../db/schema";

export const dynamic = "force-dynamic";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function fingerprint(company: string, title: string) {
  return `${normalize(company)}::${normalize(title)}`;
}

export async function GET() {
  const db = await getDb();
  return NextResponse.json(
    await db.select().from(ignoredJobs).orderBy(desc(ignoredJobs.createdAt)),
  );
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const company = String(body.company ?? "").trim();
  const title = String(body.title ?? "").trim();
  const jobUrl = String(body.jobUrl ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  if (!company || !title || !reason) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const db = await getDb();
  const key = fingerprint(company, title);
  const [row] = await db.insert(ignoredJobs).values({
    company,
    title,
    jobUrl,
    fingerprint: key,
    reason,
    createdAt: new Date().toISOString(),
  }).onConflictDoUpdate({
    target: ignoredJobs.fingerprint,
    set: { jobUrl, reason, createdAt: new Date().toISOString() },
  }).returning();

  if (jobUrl) {
    await db.update(jobs).set({ status: "忽略" }).where(eq(jobs.jobUrl, jobUrl));
  }
  return NextResponse.json(row, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  const db = await getDb();
  const [row] = await db.select().from(ignoredJobs).where(eq(ignoredJobs.id, id));
  if (row?.jobUrl) {
    await db.update(jobs).set({ status: "开放" }).where(eq(jobs.jobUrl, row.jobUrl));
  }
  await db.delete(ignoredJobs).where(eq(ignoredJobs.id, id));
  return NextResponse.json({ ok: true });
}
