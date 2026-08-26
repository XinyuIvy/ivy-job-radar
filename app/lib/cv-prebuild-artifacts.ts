export type CvPrebuildArtifactKind = "pdf" | "tex" | "text" | "review" | "decision";

type R2ObjectBody = {
  body: ReadableStream;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
  httpEtag?: string;
};

export type CvPrebuildArtifactBucket = {
  put: (
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
    options?: { httpMetadata?: { contentType?: string } },
  ) => Promise<unknown>;
  get: (key: string) => Promise<R2ObjectBody | null>;
};

const artifactDefinitions: Record<CvPrebuildArtifactKind, { filename: string; contentType: string }> = {
  pdf: { filename: "cv_draft.pdf", contentType: "application/pdf" },
  tex: { filename: "cv_draft.tex", contentType: "text/x-tex; charset=utf-8" },
  text: { filename: "cv_draft.txt", contentType: "text/plain; charset=utf-8" },
  review: { filename: "cv_review.md", contentType: "text/markdown; charset=utf-8" },
  decision: { filename: "application_decision.json", contentType: "application/json; charset=utf-8" },
};

export function cvPrebuildArtifactDefinition(kind: CvPrebuildArtifactKind) {
  return artifactDefinitions[kind];
}

export function cvPrebuildArtifactKey(
  prebuildId: string,
  responseId: string,
  kind: CvPrebuildArtifactKind,
) {
  return `cv-prebuilds/${prebuildId}/responses/${responseId}/${artifactDefinitions[kind].filename}`;
}

export async function storeCvPrebuildArtifact(
  bucket: CvPrebuildArtifactBucket,
  input: {
    prebuildId: string;
    responseId: string;
    kind: CvPrebuildArtifactKind;
    data: ArrayBuffer;
  },
) {
  const definition = artifactDefinitions[input.kind];
  const key = cvPrebuildArtifactKey(input.prebuildId, input.responseId, input.kind);
  await bucket.put(key, input.data, { httpMetadata: { contentType: definition.contentType } });
  return key;
}

export async function readCvPrebuildArtifactText(
  bucket: CvPrebuildArtifactBucket,
  key: string,
) {
  if (!key) return "";
  return (await bucket.get(key))?.text() ?? "";
}
