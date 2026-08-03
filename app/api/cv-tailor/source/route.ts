import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const templates: Record<string, string> = {
  pharma: "cv_pharma.md",
  tech: "cv_tech.md",
  quant: "cv_quant.md",
  consulting: "cv_healthcare_consulting.md",
};

async function readRaw(path: string) {
  const response = await fetch(`https://raw.githubusercontent.com/XinyuIvy/CV/main/${path}`, {
    cache: "no-store",
    headers: { "User-Agent": "Ivy-Job-Radar" },
  });
  if (!response.ok) throw new Error(`Unable to read ${path}`);
  return response.text();
}

export async function GET(request: NextRequest) {
  const track = new URL(request.url).searchParams.get("track") || "pharma";
  const filename = templates[track] || templates.pharma;
  try {
    const [template, facts, keywords] = await Promise.all([
      readRaw(`master/template-cv/${filename}`),
      readRaw("master/FACT_MASTER.md"),
      readRaw("master/template-cv/KEYWORD_ANALYSIS.md"),
    ]);
    return NextResponse.json({ track, filename, template, facts, keywords });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CV source loading failed." }, { status: 502 });
  }
}
