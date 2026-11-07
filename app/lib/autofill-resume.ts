import { archivePath } from "./application-archive";
import { isCvTemplateFilename } from "./cv-template-catalog";

export const CV_TEMPLATE_REPOSITORY = "XinyuIvy/CV";

export type AutofillResumeCandidate = {
  source: "submitted" | "customized" | "template";
  repository: string;
  path: string;
  fileName: string;
  ref: string;
  successReason: "final-submitted-cv" | "final-customized-cv" | "selected-template-cv";
  tokenKind: "archive" | "cv";
};

export function autofillArchiveId(value: string) {
  const normalized = value.trim().toUpperCase();
  return /^APP-\d{4}-[A-Z0-9]{3,12}-\d{3,}$/.test(normalized) ? normalized : "";
}

export function selectedTemplateVersion(resumeVersion: string) {
  const [rawFileName, rawRef = ""] = String(resumeVersion || "").trim().split("@", 2);
  const fileName = rawFileName.trim();
  const commitRef = /^[0-9a-f]{7,40}$/i.test(rawRef.trim()) ? rawRef.trim().toLowerCase() : "";
  return { fileName: isCvTemplateFilename(fileName) ? fileName : "", commitRef };
}

export function selectedTemplateTexFile(resumeVersion: string) {
  return selectedTemplateVersion(resumeVersion).fileName;
}

export function buildAutofillResumeCandidates(input: {
  archiveId: string;
  resumeVersion: string;
  archiveRepository: string;
}) {
  const candidates: AutofillResumeCandidate[] = [];
  const archiveId = autofillArchiveId(input.archiveId);
  if (archiveId) {
    const submittedFileName = `cv_submitted_${archiveId}.pdf`;
    candidates.push({
      source: "submitted",
      repository: input.archiveRepository,
      path: `${archivePath(archiveId)}/${submittedFileName}`,
      fileName: submittedFileName,
      ref: "main",
      successReason: "final-submitted-cv",
      tokenKind: "archive",
    });
    const customizedFileName = `cv_customized_${archiveId}.pdf`;
    candidates.push({
      source: "customized",
      repository: input.archiveRepository,
      path: `${archivePath(archiveId)}/${customizedFileName}`,
      fileName: customizedFileName,
      ref: "main",
      successReason: "final-customized-cv",
      tokenKind: "archive",
    });
  }

  const selectedTemplate = selectedTemplateVersion(input.resumeVersion);
  const templateFile = selectedTemplate.fileName;
  if (templateFile) {
    const fileName = templateFile.replace(/\.tex$/i, ".pdf");
    candidates.push({
      source: "template",
      repository: CV_TEMPLATE_REPOSITORY,
      path: `master/template-cv/${fileName}`,
      fileName,
      ref: selectedTemplate.commitRef || "main",
      successReason: "selected-template-cv",
      tokenKind: "cv",
    });
  }
  return candidates;
}

function githubContentUrl(candidate: AutofillResumeCandidate) {
  return `https://api.github.com/repos/${candidate.repository}/contents/${candidate.path}?ref=${encodeURIComponent(candidate.ref)}`;
}

export async function fetchFirstAvailableResume(input: {
  candidates: AutofillResumeCandidate[];
  archiveToken: string;
  cvToken: string;
  accept: "application/vnd.github+json" | "application/vnd.github.raw+json";
}) {
  let lastStatus = 404;
  let configuredCandidateCount = 0;
  for (const candidate of input.candidates) {
    const token = candidate.tokenKind === "archive" ? input.archiveToken : input.cvToken;
    if (!token) continue;
    configuredCandidateCount += 1;
    const response = await fetch(githubContentUrl(candidate), {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: input.accept,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Ivy-Job-Radar-Autofill",
      },
    });
    if (response.ok) return { candidate, response, lastStatus: response.status, configuredCandidateCount };
    lastStatus = response.status;
  }
  return { candidate: null, response: null, lastStatus, configuredCandidateCount };
}
