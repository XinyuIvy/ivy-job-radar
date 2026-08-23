const CV_REPOSITORY = "XinyuIvy/CV";
const GLOBAL_PROFILE_PATH = "master/application-forms/application-autofill-profile.md";

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

export async function fetchRepositoryGlobalAutofillProfile() {
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
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Global autofill profile fetch failed (${response.status}).`);
  return parseGlobalAutofillProfile(await response.text());
}

export const globalAutofillProfileSource = {
  repository: CV_REPOSITORY,
  path: GLOBAL_PROFILE_PATH,
  authority: "global_application_profile",
};
