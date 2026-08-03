import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const templates: Record<string, string> = {
  pharma: "cv_pharma.md",
  tech: "cv_tech.md",
  quant: "cv_quant.md",
  consulting: "cv_healthcare_consulting.md",
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
  const track = new URL(request.url).searchParams.get("track") || "pharma";
  const filename = templates[track] || templates.pharma;
  const { env } = await import("cloudflare:workers");
  const token = String(env.CV_GITHUB_TOKEN || "").trim();

  if (!token) {
    return NextResponse.json({
      error: "XinyuIvy/CV 是私有仓库。请先在 Site 环境中配置 CV_GITHUB_TOKEN，才能读取母版并生成文件。",
      code: "CV_TOKEN_REQUIRED",
    }, { status: 503 });
  }

  try {
    const [template, facts, keywords] = await Promise.all([
      readPrivateFile(`master/template-cv/${filename}`, token),
      readPrivateFile("master/FACT_MASTER.md", token),
      readPrivateFile("master/template-cv/KEYWORD_ANALYSIS.md", token),
    ]);
    return NextResponse.json({ track, filename, template, facts, keywords });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "CV source loading failed." }, { status: 502 });
  }
}
