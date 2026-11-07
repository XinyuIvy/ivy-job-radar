import { NextResponse } from "next/server";

import {
  createCvTemplateOption,
  CV_TEMPLATE_DIRECTORY,
  sortCvTemplateOptions,
} from "../../lib/cv-template-catalog";
import { privateGithubJson } from "../../lib/private-github-repository";

export const dynamic = "force-dynamic";

type GithubContentEntry = {
  name?: string;
  path?: string;
  type?: string;
};

export async function GET() {
  const { env } = await import("cloudflare:workers");
  const token = String(env.CV_GITHUB_TOKEN ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "CV_GITHUB_TOKEN 未配置，无法读取 CV 母版清单。" }, { status: 503 });
  }

  try {
    const entries = await privateGithubJson<GithubContentEntry[]>(
      `https://api.github.com/repos/XinyuIvy/CV/contents/${CV_TEMPLATE_DIRECTORY}?ref=main`,
      token,
    );
    const templates = sortCvTemplateOptions(entries
      .filter((entry) => entry.type === "file")
      .map((entry) => createCvTemplateOption(String(entry.name ?? "")))
      .filter((option) => option !== null));
    return NextResponse.json({ templates, count: templates.length }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "CV 母版清单读取失败。",
    }, { status: 502 });
  }
}
