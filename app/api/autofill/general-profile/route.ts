import { NextRequest, NextResponse } from "next/server";

import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from "../../../lib/bookmark-capture";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Ivy-Autofill-Key, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

const CV_REPOSITORY = "XinyuIvy/CV";
const GLOBAL_PROFILE_PATH = "master/application-forms/application-autofill-profile.md";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

async function authorize(request: NextRequest) {
  const { env } = await import("cloudflare:workers");
  const expected = await deriveBookmarkCaptureKey(String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim());
  const provided = String(request.headers.get("x-ivy-autofill-key") ?? "").trim();
  return Boolean(expected && secureBookmarkKeyEqual(expected, provided));
}

export function parseGlobalAutofillProfile(markdown: string) {
  const match = markdown.match(/```json\s+autofill-profile\s*\n([\s\S]*?)```/i);
  if (!match) throw new Error("Global autofill profile is missing its machine-readable JSON block.");
  const profile = JSON.parse(match[1]) as Record<string, unknown>;
  if (profile.schema_version !== "global-application-autofill-profile-v1") {
    throw new Error("Global autofill profile schema is unsupported.");
  }
  if (!Array.isArray(profile.education)) {
    throw new Error("Global autofill profile is missing education entries.");
  }
  return profile;
}

export async function GET(request: NextRequest) {
  if (!await authorize(request)) return json({ error: "Invalid autofill key." }, 401);

  const { env } = await import("cloudflare:workers");
  const token = String(env.CV_GITHUB_TOKEN || "").trim();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Ivy-Job-Radar-Autofill",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `https://api.github.com/repos/${CV_REPOSITORY}/contents/${GLOBAL_PROFILE_PATH}?ref=main`,
    { cache: "no-store", headers },
  );
  if (response.status === 404) return json({ error: "Global application autofill profile is not available yet." }, 404);
  if (!response.ok) return json({ error: `Global autofill profile fetch failed (${response.status}).` }, 502);

  try {
    const markdown = await response.text();
    const profile = parseGlobalAutofillProfile(markdown);
    return json({
      ok: true,
      source: { repository: CV_REPOSITORY, path: GLOBAL_PROFILE_PATH, authority: "global_application_profile" },
      profile,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Global autofill profile could not be parsed." }, 502);
  }
}
