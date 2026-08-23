import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";

import { getDb } from "../../../../db";
import { userProfiles } from "../../../../db/schema";
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from "../../../lib/bookmark-capture";
import {
  hasStoredFixedApplicationProfile,
  mergeFixedApplicationProfile,
  normalizeFixedApplicationProfile,
} from "../../../lib/application-profile";
import {
  fetchRepositoryGlobalAutofillProfile,
  globalAutofillProfileSource,
  parseGlobalAutofillProfile,
} from "../../../lib/global-autofill-profile";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "X-Ivy-Autofill-Key, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

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

export { parseGlobalAutofillProfile };

export async function GET(request: NextRequest) {
  if (!await authorize(request)) return json({ error: "Invalid autofill key." }, 401);

  try {
    const repositoryProfile = await fetchRepositoryGlobalAutofillProfile();
    if (!repositoryProfile) return json({ error: "Global application autofill profile is not available yet." }, 404);
    const db = await getDb();
    const [stored] = await db.select({ json: userProfiles.autofillProfileJson })
      .from(userProfiles)
      .orderBy(desc(userProfiles.updatedAt))
      .limit(1);
    let profile = repositoryProfile;
    if (stored?.json) {
      const parsed = JSON.parse(stored.json) as unknown;
      if (hasStoredFixedApplicationProfile(parsed)) {
        profile = mergeFixedApplicationProfile(repositoryProfile, normalizeFixedApplicationProfile(parsed));
      }
    }
    return json({
      ok: true,
      source: {
        ...globalAutofillProfileSource,
        fixedApplicationProfile: stored?.json ? "job_radar_profile" : "repository_fallback",
      },
      profile,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Global autofill profile could not be parsed." }, 502);
  }
}
