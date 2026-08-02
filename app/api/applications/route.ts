import { desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { applications } from "../../../db/schema";

export const dynamic = "force-dynamic";

const editableFields = [
  "company",
  "title",
  "region",
  "location",
  "track",
  "jobUrl",
  "applicationId",
  "source",
  "fit",
  "interest",
  "priority",
  "status",
  "discoveredDate",
  "appliedDate",
  "followUpDate",
  "nextAction",
  "resumeVersion",
  "workAuthorization",
  "interviewNotes",
  "notes",
] as const;

function cleanPayload(input: Record<string, unknown>) {
  const payload: Record<string, string | number> = {};
  for (const field of editableFields) {
    if (input[field] === undefined) continue;
    if (field === "fit" || field === "interest") {
      payload[field] = Math.min(5, Math.max(1, Number(input[field]) || 3));
    } else {
      payload[field] = String(input[field] ?? "").trim();
    }
  }
  return payload;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

export async function GET() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(applications)
    .orderBy(desc(applications.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const payload = cleanPayload(body);
  if (!payload.company || !payload.title) {
    return NextResponse.json(
      { error: "Company and job title are required." },
      { status: 400 },
    );
  }

  const db = await getDb();
  const rows = await db.select().from(applications);
  const companyKey = normalize(payload.company);
  const titleKey = normalize(payload.title);
  const jobUrl = String(payload.jobUrl ?? "").trim();
  const applicationId = String(payload.applicationId ?? "").trim().toLocaleLowerCase();
  const duplicate = rows.find((row) =>
    (jobUrl && row.jobUrl.trim() === jobUrl)
    || (applicationId && row.applicationId.trim().toLocaleLowerCase() === applicationId)
    || (normalize(row.company) === companyKey && normalize(row.title) === titleKey),
  );
  if (duplicate) {
    return NextResponse.json(duplicate, { status: 200 });
  }

  const now = new Date().toISOString();
  const [created] = await db
    .insert(applications)
    .values({
      ...(payload as typeof applications.$inferInsert),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "A valid record id is required." }, { status: 400 });
  }
  const db = await getDb();
  const [updated] = await db
    .update(applications)
    .set({
      ...(cleanPayload(body) as Partial<typeof applications.$inferInsert>),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(applications.id, id))
    .returning();
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "A valid record id is required." }, { status: 400 });
  }
  const db = await getDb();
  await db.delete(applications).where(eq(applications.id, id));
  return NextResponse.json({ ok: true });
}
