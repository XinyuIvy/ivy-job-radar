import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "../../../db";
import { userProfiles } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";
import {
  emptyFixedApplicationProfile,
  hasStoredFixedApplicationProfile,
  normalizeFixedApplicationProfile,
  profileFromGlobalAutofill,
} from "../../lib/application-profile";
import { fetchRepositoryGlobalAutofillProfile } from "../../lib/global-autofill-profile";

export const dynamic = "force-dynamic";

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

function splitName(value: string) {
  const pieces = value.trim().split(/\s+/).filter(Boolean);
  if (pieces.length < 2) return { firstName: value.trim(), lastName: "" };
  return { firstName: pieces.slice(0, -1).join(" "), lastName: pieces.at(-1) ?? "" };
}

async function fallbackProfile(email: string, fullName: string | null) {
  try {
    const globalProfile = await fetchRepositoryGlobalAutofillProfile();
    if (globalProfile) {
      const profile = profileFromGlobalAutofill(globalProfile);
      if (!profile.identity.email) profile.identity.email = email;
      if (!profile.identity.firstName && fullName) {
        Object.assign(profile.identity, splitName(fullName));
      }
      return profile;
    }
  } catch {
    // The editor remains usable even when the CV repository is temporarily unavailable.
  }
  const profile = structuredClone(emptyFixedApplicationProfile);
  profile.identity.email = email;
  if (fullName) Object.assign(profile.identity, splitName(fullName));
  return profile;
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const db = await getDb();
  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.userEmail, user.email)).limit(1);
  let applicationProfile;
  if (row && hasStoredFixedApplicationProfile(parseJson(row.autofillProfileJson))) {
    applicationProfile = normalizeFixedApplicationProfile(parseJson(row.autofillProfileJson));
  } else {
    applicationProfile = await fallbackProfile(user.email, user.fullName);
    if (row?.fullName && !applicationProfile.identity.firstName) {
      Object.assign(applicationProfile.identity, splitName(row.fullName));
    }
    applicationProfile.identity.email ||= user.email;
  }
  return NextResponse.json(
    { userEmail: user.email, applicationProfile },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const raw = await request.json().catch(() => null) as { applicationProfile?: unknown } | null;
  if (!raw?.applicationProfile) {
    return NextResponse.json({ error: "Application profile is required." }, { status: 400 });
  }
  const applicationProfile = normalizeFixedApplicationProfile(raw.applicationProfile);
  applicationProfile.identity.email ||= user.email;
  const now = new Date().toISOString();
  const englishFullName = [
      applicationProfile.identity.firstName,
      applicationProfile.identity.middleName,
      applicationProfile.identity.lastName,
    ].filter(Boolean).join(" ");
  const chineseFullName = applicationProfile.identity.chineseFullName
    || [applicationProfile.identity.chineseLastName, applicationProfile.identity.chineseFirstName].filter(Boolean).join("");
  const fullName = applicationProfile.defaultLanguage === "zh"
    ? chineseFullName || englishFullName
    : englishFullName || chineseFullName;
  const selectedAddress = applicationProfile.defaultLanguage === "zh"
    ? applicationProfile.addresses.china
    : applicationProfile.addresses.us;
  const location = [selectedAddress.city, selectedAddress.state, selectedAddress.country].filter(Boolean).join(", ");
  const workAuthorization = applicationProfile.defaultLanguage === "zh"
    ? applicationProfile.eligibility.workAuthorizationChina
    : applicationProfile.eligibility.visaStatusUS || applicationProfile.eligibility.workAuthorizationUS;
  const sponsorshipNeed = applicationProfile.eligibility.sponsorshipUS;
  const db = await getDb();
  await db.insert(userProfiles).values({
    userEmail: user.email,
    fullName,
    location,
    workAuthorization,
    sponsorshipNeed,
    education: "",
    targetRoles: "",
    targetIndustries: "",
    professionalSummary: "",
    skills: "[]",
    autofillProfileJson: JSON.stringify(applicationProfile),
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: userProfiles.userEmail,
    set: {
      fullName,
      location,
      workAuthorization,
      sponsorshipNeed,
      targetRoles: "",
      targetIndustries: "",
      professionalSummary: "",
      autofillProfileJson: JSON.stringify(applicationProfile),
      updatedAt: now,
    },
  });
  return NextResponse.json(
    { userEmail: user.email, applicationProfile },
    { headers: { "Cache-Control": "no-store" } },
  );
}
