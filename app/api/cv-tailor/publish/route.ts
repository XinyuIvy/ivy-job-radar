import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({
    error: "Job Radar 不再自动生成或发布定制 CV。请先创建申请档案，并在 Chat 中完成人工分类与内容确认。",
    code: "AUTOMATIC_CV_PUBLISH_DISABLED",
  }, { status: 410 });
}
