import { NextRequest, NextResponse } from "next/server";

import {
  decideScreeningRule,
  getScreeningLearningSnapshot,
} from "../../lib/screening-learning-store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getScreeningLearningSnapshot());
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const kind = String(body.kind ?? "");
  const term = String(body.term ?? "").trim().toLowerCase();
  const status = String(body.status ?? "");
  if (!(["include", "exclude"].includes(kind) && ["approved", "rejected"].includes(status) && term)) {
    return NextResponse.json({ error: "Invalid screening decision." }, { status: 400 });
  }
  try {
    await decideScreeningRule(
      kind as "include" | "exclude",
      term,
      status as "approved" | "rejected",
    );
    return NextResponse.json(await getScreeningLearningSnapshot());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save screening decision." },
      { status: 400 },
    );
  }
}
