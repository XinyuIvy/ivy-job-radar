import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type TemplateLanguage = "en" | "zh";

const templates: Record<TemplateLanguage, Record<string, string | null>> = {
  en: {
    pharma: "cv_pharma.tex",
    tech: "cv_tech.tex",
    quant: "cv_quant.tex",
    consulting: "cv_healthcare_consulting.tex",
    clinical_neuro: null,
  },
  zh: {
    pharma: "cv_pharma_cn.tex",
    tech: "cv_tech_cn.tex",
    quant: "cv_quant_cn.tex",
    consulting: "cv_healthcare_consulting_cn.tex",
    clinical_neuro: "cv_clinical_data_neuro_cn.tex",
  },
};

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readPrivateFile(path: string, token: string) {
  const response = await fetch(`https://api.github.com/repos/XinyuIvy/CV/contents/${path}?ref=main`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Ivy-Job-Radar",
    },
  });
  if (!response.ok) throw new Error(`无法从私有 CV 仓库读取 ${path}（GitHub ${response.status}）。`);
  const payload = await response.json() as { content?: string; encoding?: string };
  if (payload.encoding !== "base64" || !payload.content) throw new Error(`GitHub 未返回 ${path} 的文件内容。`);
  return decodeBase64Utf8(payload.content);
}

export async function GET(request: NextRequest) {
  const search = new URL(request.url).searchParams;
  const language: TemplateLanguage = search.get("language") === "zh" ? "zh" : "en";
  const requestedTrack = search.get("track") || "pharma";
  const track = requestedTrack in templates[language] ? requestedTrack : "pharma";
  const filename = templates[language][track];
  const { env } = await import("cloudflare:workers");
  const token = String(env.CV_GITHUB_TOKEN || "").trim();

  if (!token) {
    return NextResponse.json({
      error: "XinyuIvy/CV 是私有仓库。请先在 Site 环境中配置 CV_GITHUB_TOKEN，才能读取母版并生成文件。",
      code: "CV_TOKEN_REQUIRED",
    }, { status: 503 });
  }

  if (!filename) {
    return NextResponse.json({
      error: "脑科学 / 临床数据 / 医疗器械方向目前只有中文 LaTeX 母版，请选择中文母版。",
      code: "CV_TEMPLATE_LANGUAGE_UNAVAILABLE",
    }, { status: 400 });
  }

  try {
    const [template, facts, keywords, atomicFacts] = await Promise.all([
      readPrivateFile(`master/template-cv/${filename}`, token),
      readPrivateFile("master/FACT_MASTER.md", token),
      readPrivateFile("master/template-cv/KEYWORD_ANALYSIS.md", token),
      readPrivateFile("master/project-evidence/STAGE3_ATOMIC_FACTS.yaml", token),
    ]);
    return NextResponse.json({ track, language, filename, template, facts, keywords, atomicFacts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CV source loading failed." }, { status: 502 });
  }
}
