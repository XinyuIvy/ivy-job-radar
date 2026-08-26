import {
  type CvPrebuildArtifactBucket,
  type CvPrebuildArtifactKind,
  storeCvPrebuildArtifact,
} from "./cv-prebuild-artifacts";
import {
  completeAssistantMessage,
  completeCvPrebuildRun,
  failCvPrebuildRun,
  markCvPrebuildRunning,
  type CvPrebuildDatabase,
  type CvPrebuildJobRow,
} from "./cv-prebuild-store";
import {
  citedOpenAiContainerFiles,
  downloadOpenAiContainerFile,
  listOpenAiContainerFiles,
  openAiContainerId,
  openAiFailureReason,
  openAiOutputText,
  openAiUsage,
  retrieveOpenAiCvResponse,
  type OpenAiContainerFile,
  type OpenAiCvResponse,
} from "./openai-cv-prebuilder";

const artifactKindsByFilename: Record<string, CvPrebuildArtifactKind> = {
  "cv_draft.pdf": "pdf",
  "cv_draft.tex": "tex",
  "cv_draft.txt": "text",
  "cv_review.md": "review",
  "application_decision.json": "decision",
};

function terminalFailure(response: OpenAiCvResponse) {
  return ["failed", "cancelled", "incomplete"].includes(response.status);
}

function artifactFileMap(files: OpenAiContainerFile[]) {
  const mapped = new Map<CvPrebuildArtifactKind, OpenAiContainerFile>();
  for (const file of files) {
    const kind = artifactKindsByFilename[file.filename];
    if (kind) mapped.set(kind, file);
  }
  return mapped;
}

export async function reconcileCvPrebuildRun(input: {
  database: CvPrebuildDatabase;
  bucket: CvPrebuildArtifactBucket;
  row: CvPrebuildJobRow;
  apiKey: string;
  now: string;
}) {
  const { database, bucket, row, apiKey, now } = input;
  if (!row.openaiResponseId || !row.generationKey) return row;

  let response: OpenAiCvResponse;
  try {
    response = await retrieveOpenAiCvResponse(apiKey, row.openaiResponseId);
  } catch {
    return row;
  }

  if (["queued", "in_progress"].includes(response.status)) {
    return markCvPrebuildRunning(database, row.generationKey, now);
  }
  if (terminalFailure(response)) {
    return failCvPrebuildRun(
      database,
      row.generationKey,
      row.openaiResponseId,
      openAiFailureReason(response),
      now,
    );
  }
  if (response.status !== "completed") return row;

  try {
    const responseContainerId = openAiContainerId(response) || row.openaiContainerId;
    let files = citedOpenAiContainerFiles(response);
    if (responseContainerId) {
      const listed = await listOpenAiContainerFiles(apiKey, responseContainerId);
      const combined = new Map([...files, ...listed].map((file) => [file.id, file]));
      files = [...combined.values()];
    }
    const fileMap = artifactFileMap(files);
    if (!fileMap.has("tex") || !fileMap.has("pdf")) {
      throw new Error("Required CV artifacts are missing.");
    }

    const keys: Partial<Record<CvPrebuildArtifactKind, string>> = {};
    await Promise.all([...fileMap.entries()].map(async ([kind, file]) => {
      const data = await downloadOpenAiContainerFile(apiKey, file.containerId, file.id);
      keys[kind] = await storeCvPrebuildArtifact(bucket, {
        prebuildId: row.prebuildId,
        responseId: row.openaiResponseId,
        kind,
        data,
      });
    }));

    const assistantText = openAiOutputText(response)
      || "CV 初稿已生成。你可以查看 PDF，并在这里继续告诉我需要修改的内容。";
    await completeAssistantMessage(database, row.openaiResponseId, assistantText, now);
    const usage = openAiUsage(response);
    return completeCvPrebuildRun(database, row.generationKey, {
      responseId: row.openaiResponseId,
      containerId: responseContainerId,
      serviceTier: String(response.service_tier || row.serviceTier),
      draftTexKey: keys.tex || row.draftTexKey,
      draftPdfKey: keys.pdf || row.draftPdfKey,
      draftTextKey: keys.text || row.draftTextKey,
      reviewKey: keys.review || row.reviewKey,
      decisionKey: keys.decision || row.decisionKey,
      ...usage,
      now,
    });
  } catch {
    return failCvPrebuildRun(
      database,
      row.generationKey,
      row.openaiResponseId,
      "CV_ARTIFACT_PERSIST_FAILED",
      now,
    );
  }
}
