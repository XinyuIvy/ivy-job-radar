import { and, desc, eq, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { applications } from "../../../db/schema";
import {
  canonicalizeJobIdentityUrl,
  isPlaceholderJobTitle,
  sameLogicalJob,
} from "../../lib/job-identity";

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
  "deadline",
  "deadlineType",
  "deadlineSource",
  "plannedApplicationDate",
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

function baseJobPageUrl(value: unknown) {
  const canonical = canonicalizeJobIdentityUrl(value);
  try {
    const url = new URL(canonical);
    if (/^#ivy-job-/i.test(url.hash)) url.hash = "";
    return url.toString();
  } catch {
    return canonical;
  }
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
  const jobUrl = String(payload.jobUrl ?? "").trim();
  const incoming = {
    company: String(payload.company),
    title: String(payload.title),
    location: String(payload.location ?? ""),
    jobUrl,
    applicationId: String(payload.applicationId ?? ""),
  };
  const candidateCondition = incoming.applicationId
    ? or(
      eq(applications.jobUrl, jobUrl),
      eq(applications.applicationId, incoming.applicationId),
      and(eq(applications.company, incoming.company), eq(applications.title, incoming.title)),
    )
    : or(
      eq(applications.jobUrl, jobUrl),
      and(eq(applications.company, incoming.company), eq(applications.title, incoming.title)),
    );
  const rows = await db.select().from(applications).where(candidateCondition);
  const duplicate = rows.find((row) => sameLogicalJob(row, incoming));
  if (duplicate) {
    return NextResponse.json(duplicate, { status: 200 });
  }

  const now = new Date().toISOString();
  const legacyAmbiguous = incoming.applicationId && isPlaceholderJobTitle(incoming.title)
    ? rows.find((row) =>
      !row.applicationId
      && normalize(row.company) === normalize(incoming.company)
      && normalize(row.title) === normalize(incoming.title)
      && baseJobPageUrl(row.jobUrl) === baseJobPageUrl(jobUrl),
    )
    : undefined;
  if (legacyAmbiguous) {
    const [updated] = await db
      .update(applications)
      .set({
        ...(payload as Partial<typeof applications.$inferInsert>),
        updatedAt: now,
      })
      .where(eq(applications.id, legacyAmbiguous.id))
      .returning();
    return NextResponse.json(updated, { status: 200 });
  }

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
