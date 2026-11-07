import { and, desc, eq, notInArray, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import { getDb } from "../../../db";
import { applications, applicationStatusEvents, cvPrebuildJobs } from "../../../db/schema";
import { resolveApplicationRecordIds } from "../../lib/application-archive";
import {
  canonicalizeJobIdentityUrl,
  isPlaceholderJobTitle,
  sameCompanyRole,
  sameLogicalJob,
} from "../../lib/job-identity";

export const dynamic = "force-dynamic";

type ApplicationRow = typeof applications.$inferSelect;

async function ensureApplicationRecordIds(
  db: Awaited<ReturnType<typeof getDb>>,
  row: ApplicationRow,
) {
  const resolved = resolveApplicationRecordIds(row);
  if (resolved.archiveId === row.archiveId && resolved.applicationId === row.applicationId) return row;
  const [updated] = await db.update(applications).set(resolved).where(eq(applications.id, row.id)).returning();
  return updated ?? { ...row, ...resolved };
}

async function ensureAllApplicationRecordIds(
  db: Awaited<ReturnType<typeof getDb>>,
  rows: ApplicationRow[],
) {
  return Promise.all(rows.map((row) => ensureApplicationRecordIds(db, row)));
}

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

function resumeUsesTemplate(resumeVersion: string, templateFile: string) {
  return !resumeVersion || !templateFile || resumeVersion === templateFile || resumeVersion.startsWith(`${templateFile}@`);
}

export async function GET() {
  const db = await getDb();
  let rows = await ensureAllApplicationRecordIds(db, await db
    .select()
    .from(applications)
    .orderBy(desc(applications.updatedAt)));
  const applicationHistory = rows.filter((row) => !["收藏", "准备材料"].includes(row.status));
  const duplicatePending = rows.filter((row) =>
    row.status === "准备材料"
    && applicationHistory.some((history) => history.id !== row.id && sameCompanyRole(history, row)),
  );
  if (duplicatePending.length > 0) {
    const now = new Date().toISOString();
    await Promise.all(duplicatePending.map(async (row) => {
      await db.update(applications).set({
        status: "撤回",
        nextAction: "同一公司与岗位名称已有申请历史，已自动移出待申请",
        updatedAt: now,
      }).where(eq(applications.id, row.id));
      await db.update(cvPrebuildJobs).set({
        status: "cancelled",
        lastError: "DUPLICATE_APPLICATION_HISTORY",
        updatedAt: now,
        completedAt: now,
      }).where(and(
        eq(cvPrebuildJobs.applicationRowId, row.id),
        notInArray(cvPrebuildJobs.status, ["ready", "cancelled", "stale"]),
      ));
    }));
    rows = await ensureAllApplicationRecordIds(
      db,
      await db.select().from(applications).orderBy(desc(applications.updatedAt)),
    );
  }
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
    if (body.mergeDuplicate !== true) {
      return NextResponse.json(await ensureApplicationRecordIds(db, duplicate), { status: 200 });
    }

    const desiredStatus = String(payload.status ?? duplicate.status);
    const requestedTemplate = String(payload.resumeVersion ?? "");
    if (["收藏", "准备材料"].includes(duplicate.status)) {
      if (!resumeUsesTemplate(duplicate.resumeVersion, requestedTemplate)) {
        return NextResponse.json({
          error: `这条岗位已记录使用 ${duplicate.resumeVersion}，不能静默改成 ${requestedTemplate}。`,
        }, { status: 409 });
      }
      const now = new Date().toISOString();
      const [updated] = await db.update(applications).set({
        ...(payload as Partial<typeof applications.$inferInsert>),
        updatedAt: now,
      }).where(eq(applications.id, duplicate.id)).returning();
      if (desiredStatus !== duplicate.status) {
        await db.insert(applicationStatusEvents).values({
          applicationId: duplicate.id,
          status: desiredStatus,
          occurredAt: now,
        });
      }
      return NextResponse.json(await ensureApplicationRecordIds(db, updated), { status: 200 });
    }
    if (desiredStatus === "准备材料") {
      return NextResponse.json({
        error: `该岗位已经在申请记录中，当前状态是“${duplicate.status}”，不能重复放回待申请。`,
      }, { status: 409 });
    }
    if (duplicate.status !== "已申请") {
      return NextResponse.json({
        error: `该岗位已经在申请记录中，当前状态是“${duplicate.status}”。`,
      }, { status: 409 });
    }
    if (!resumeUsesTemplate(duplicate.resumeVersion, requestedTemplate)) {
      return NextResponse.json({
        error: `这条申请已记录使用 ${duplicate.resumeVersion}，与本次选择的 ${requestedTemplate} 不一致。`,
      }, { status: 409 });
    }
    if (!duplicate.resumeVersion && requestedTemplate) {
      const now = new Date().toISOString();
      const [updated] = await db.update(applications).set({
        resumeVersion: requestedTemplate,
        updatedAt: now,
      }).where(eq(applications.id, duplicate.id)).returning();
      return NextResponse.json(await ensureApplicationRecordIds(db, updated), { status: 200 });
    }
    return NextResponse.json(await ensureApplicationRecordIds(db, duplicate), { status: 200 });
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
    return NextResponse.json(await ensureApplicationRecordIds(db, updated), { status: 200 });
  }

  const [created] = await db
    .insert(applications)
    .values({
      ...(payload as typeof applications.$inferInsert),
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return NextResponse.json(await ensureApplicationRecordIds(db, created), { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "A valid record id is required." }, { status: 400 });
  }
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, id))
    .limit(1);
  if (!existing) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  const payload = cleanPayload(body);
  const now = new Date().toISOString();
  const [updated] = await db
    .update(applications)
    .set({
      ...(payload as Partial<typeof applications.$inferInsert>),
      updatedAt: now,
    })
    .where(eq(applications.id, id))
    .returning();
  if (payload.status && payload.status !== existing.status) {
    await db.insert(applicationStatusEvents).values({
      applicationId: id,
      status: String(payload.status),
      occurredAt: now,
    });
  }
  return NextResponse.json(await ensureApplicationRecordIds(db, updated));
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
