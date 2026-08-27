export const DEFAULT_CV_MODEL = "gpt-5.6-terra";
export const FALLBACK_CV_MODEL = "gpt-5.6-luna";
export const DEFAULT_CV_SERVICE_TIER = "flex";
export const RETRY_CV_SERVICE_TIER = "default";
export const FALLBACK_CV_SERVICE_TIER = "default";
export const FALLBACK_CV_MAX_OUTPUT_TOKENS = 32_000;

export type CvServiceTier = typeof DEFAULT_CV_SERVICE_TIER | typeof RETRY_CV_SERVICE_TIER;

export type CvBundleInputFile = {
  filename: string;
  text: string;
};

export type OpenAiCvResponse = {
  id: string;
  status: string;
  conversation?: string | { id?: string } | null;
  service_tier?: string | null;
  output?: unknown[];
  error?: { code?: string | null; message?: string | null } | null;
  incomplete_details?: { reason?: string | null } | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  } | null;
};

export function openAiFailureReason(response: OpenAiCvResponse) {
  const status = String(response.status || "failed").toUpperCase();
  const details = [
    response.error?.code,
    response.error?.message,
    response.incomplete_details?.reason,
  ]
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return [`OPENAI_${status}`, ...details].join(": ").slice(0, 160);
}

export type OpenAiContainerFile = {
  id: string;
  containerId: string;
  filename: string;
};

export class OpenAiCvError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(`OpenAI CV request failed with ${status}.`);
    this.status = status;
    this.code = code;
  }
}

const INITIAL_INSTRUCTIONS = `You are a senior recruiter and hiring evaluator with deep experience in the specific industry and function described by the attached JD, as well as the Ivy CV Prebuilder. Evaluate the candidate from that relevant industry's experienced hiring perspective throughout the task. Work only from the attached frozen files. The full JD is authoritative, while the canonical indexes and match packet are supporting evidence. Never invent facts, dates, skills, publication status, ownership, or impact.

Prioritize the JD as hard requirements, core responsibilities, strong preferences, and secondary keywords. After drafting, identify the three most likely recruiter rejection reasons, retrieve any overlooked supporting evidence from the attached fact and canonical files, and repair every evidence-supported weakness. Then run a ten-second recruiter scan of the Summary, Skills, section order, and first three core bullets. Those elements must communicate one coherent candidate positioning and make the strongest interview case immediately. Record unresolved gaps honestly in cv_review.md.

Use the hosted shell for file work. Create these exact artifacts under /mnt/data:
- cv_draft.tex: a complete tailored LaTeX CV derived from cv_base.tex
- cv_draft.pdf: the compiled preview, using LuaLaTeX twice
- cv_draft.txt: text extracted from the PDF
- cv_review.md: role profile, evidence choices, keyword coverage, fact audit, language audit, physical page count, and any unresolved issue
- application_decision.json: strict machine-readable application decision using this exact shape: {"eligible":boolean,"confidence":number,"recommended_action":"apply"|"review"|"skip","hard_blockers":string[],"matched_requirements":string[],"unsupported_preferences":string[]}. Set recommended_action to apply only when every explicit minimum requirement is supported by the frozen facts, the experience requirement is compatible, and the JD has no citizenship, U.S. Person, export-control, clearance, or sponsorship blocker. Use review for genuine ambiguity and skip for a confirmed hard mismatch.

The PDF must be at most two physical pages, close to but not crowded to two pages, text-extractable, and faithful to the frozen template. Run pdfinfo and pdftotext. If compilation fails, repair the TeX and retry. Do not write to GitHub, create an APP ID, change application state, or create final submitted artifacts.

In the final assistant response, briefly summarize the draft and attach all five files. Respond in the CV language.`;

const REVISION_INSTRUCTIONS = `You are continuing one Ivy CV Prebuilder conversation. Apply the user's requested changes to the attached current draft while preserving every previously frozen fact boundary and the original CV language and template.

Use the hosted shell and replace these exact artifacts under /mnt/data:
- cv_draft.tex
- cv_draft.pdf
- cv_draft.txt
- cv_review.md
- application_decision.json

Compile with LuaLaTeX twice, verify at most two physical pages with pdfinfo, verify extractable text with pdftotext, and repair any error before finishing. Re-evaluate application_decision.json after every material revision. Do not write to GitHub, create an APP ID, change application state, or create a final submitted artifact. In the final assistant response, summarize the changes and attach all five files.`;

const bundleOrder = [
  "fact_master_snapshot.md",
  "cv_display_rules_snapshot.yaml",
  "agent_context_manifest.md",
  "canonical_project_index.jsonl",
  "canonical_fact_index.jsonl",
  "canonical_capability_index.jsonl",
  "canonical_concept_index.jsonl",
  "canonical_relation_index.jsonl",
  "canonical_retrieval_index.jsonl",
  "cv_base.tex",
  "job_record.yaml",
  "jd_snapshot.md",
  "prebuild_prompt.txt",
];

export const MAX_CV_AGENT_INPUT_CHARS = 120_000;
export const MAX_CV_FALLBACK_INPUT_CHARS = 30_000;

const compactableCvFiles = new Set([
  "fact_master_snapshot.md",
  "canonical_project_index.jsonl",
  "canonical_fact_index.jsonl",
  "canonical_capability_index.jsonl",
  "canonical_concept_index.jsonl",
  "canonical_relation_index.jsonl",
  "canonical_retrieval_index.jsonl",
]);

const contextStopWords = new Set([
  "and", "the", "with", "for", "from", "that", "this", "are", "you", "your",
  "will", "have", "has", "job", "role", "work", "team", "required", "preferred",
  "工作", "岗位", "负责", "要求", "优先", "相关", "能力", "经验", "进行", "以及",
]);

function contextTerms(text: string) {
  const terms = new Set<string>();
  const normalized = text.toLocaleLowerCase();
  for (const word of normalized.match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []) {
    if (!contextStopWords.has(word)) terms.add(word);
  }
  for (const sequence of normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const pair = sequence.slice(index, index + 2);
      if (!contextStopWords.has(pair)) terms.add(pair);
    }
  }
  return [...terms].sort((left, right) => right.length - left.length).slice(0, 180);
}

function relevanceScore(text: string, terms: string[]) {
  const normalized = text.toLocaleLowerCase();
  return terms.reduce((score, term) => score + Number(normalized.includes(term)), 0);
}

function takeRankedParts(parts: string[], maxChars: number, terms: string[]) {
  if (parts.join("").length <= maxChars) return parts.join("");
  const ranked = parts.map((text, index) => ({ text, index, score: relevanceScore(text, terms) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected: Array<{ text: string; index: number }> = [];
  let used = 0;
  for (const part of ranked) {
    if (used + part.text.length > maxChars && selected.length) continue;
    const text = part.text.length > maxChars ? part.text.slice(0, maxChars) : part.text;
    selected.push({ text, index: part.index });
    used += text.length;
    if (used >= maxChars) break;
  }
  return selected.sort((left, right) => left.index - right.index).map((part) => part.text).join("");
}

function compactCvFile(file: CvBundleInputFile, maxChars: number, terms: string[]) {
  if (file.text.length <= maxChars) return file;
  if (file.filename.endsWith(".jsonl")) {
    const lines = file.text.split(/(?<=\n)/);
    return { ...file, text: takeRankedParts(lines, maxChars, terms) };
  }
  const blocks = file.text.split(/(?=^#{1,6}\s)/m);
  return { ...file, text: takeRankedParts(blocks, maxChars, terms) };
}

export function compactCvBundleFilesForAgent(
  files: CvBundleInputFile[],
  maxInputChars = MAX_CV_AGENT_INPUT_CHARS,
) {
  const ordered = orderedCvBundleFiles(files);
  const jd = ordered.find((file) => file.filename === "jd_snapshot.md")?.text ?? "";
  const terms = contextTerms(jd);
  const fixed = ordered.filter((file) => !compactableCvFiles.has(file.filename));
  const compactable = ordered.filter((file) => compactableCvFiles.has(file.filename));
  const fixedChars = fixed.reduce((total, file) => total + file.text.length, 0);
  const available = Math.max(10_000, maxInputChars - fixedChars - 2_000);
  const factBudget = Math.max(6_000, Math.floor(available * 0.62));
  const indexBudget = Math.max(500, Math.floor((available - factBudget) / Math.max(1, compactable.length - 1)));
  const compacted = compactable.map((file) => compactCvFile(
    file,
    file.filename === "fact_master_snapshot.md" ? factBudget : indexBudget,
    terms,
  ));
  const manifestLines = [
    "# Agent Context Manifest",
    "",
    "The private archive retains every complete frozen source file.",
    "This API request contains the complete JD, selected CV template, display rules, and deterministic JD-relevant slices of large fact/index files.",
    "Only attached facts may be treated as verified evidence. Missing evidence must remain a gap.",
    "",
    ...compacted.map((file) => {
      const original = ordered.find((item) => item.filename === file.filename)?.text.length ?? file.text.length;
      return `- ${file.filename}: ${file.text.length} of ${original} characters attached`;
    }),
    "",
  ];
  return orderedCvBundleFiles([
    ...fixed,
    ...compacted,
    { filename: "agent_context_manifest.md", text: manifestLines.join("\n") },
  ]);
}

function fileMimeType(filename: string) {
  if (filename.endsWith(".md")) return "text/markdown";
  if (filename.endsWith(".json") || filename.endsWith(".jsonl")) return "application/json";
  if (filename.endsWith(".yaml") || filename.endsWith(".yml")) return "application/yaml";
  if (filename.endsWith(".tex")) return "text/x-tex";
  return "text/plain";
}

function encodeBase64Utf8(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function inputFile(file: CvBundleInputFile) {
  return {
    type: "input_file",
    filename: file.filename,
    file_data: `data:${fileMimeType(file.filename)};base64,${encodeBase64Utf8(file.text)}`,
  };
}

export function orderedCvBundleFiles(files: CvBundleInputFile[]) {
  const position = new Map(bundleOrder.map((filename, index) => [filename, index]));
  return [...files].sort((left, right) =>
    (position.get(left.filename) ?? bundleOrder.length)
      - (position.get(right.filename) ?? bundleOrder.length),
  );
}

function openAiHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function openAiJson<T>(apiKey: string, path: string, init?: RequestInit) {
  const response = await fetch(`https://api.openai.com${path}`, {
    ...init,
    cache: "no-store",
    headers: { ...openAiHeaders(apiKey), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    let code = "OPENAI_REQUEST_FAILED";
    try {
      const payload = await response.json() as { error?: { code?: string } };
      code = String(payload.error?.code || code).slice(0, 100);
    } catch {}
    throw new OpenAiCvError(response.status, code);
  }
  return response.json() as Promise<T>;
}

export async function createOpenAiConversation(apiKey: string, prebuildId: string) {
  return openAiJson<{ id: string }>(apiKey, "/v1/conversations", {
    method: "POST",
    body: JSON.stringify({ metadata: { prebuild_id: prebuildId, product: "ivy-job-radar" } }),
  });
}

async function startResponse(input: {
  apiKey: string;
  conversationId: string;
  model?: string;
  instructions: string;
  content: unknown[];
  metadata: Record<string, string>;
  serviceTier?: CvServiceTier;
  maxOutputTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
}) {
  const model = input.model || DEFAULT_CV_MODEL;
  const body = {
    model,
    conversation: input.conversationId,
    instructions: input.instructions,
    input: [{ role: "user", content: input.content }],
    tools: [{ type: "shell", environment: { type: "container_auto" } }],
    tool_choice: "required",
    reasoning: { effort: input.reasoningEffort || "high" },
    max_output_tokens: input.maxOutputTokens ?? 16_000,
    background: true,
    store: true,
    service_tier: input.serviceTier || DEFAULT_CV_SERVICE_TIER,
    metadata: input.metadata,
  };
  try {
    return await openAiJson<OpenAiCvResponse>(input.apiKey, "/v1/responses", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (!(error instanceof OpenAiCvError) || error.status !== 400) throw error;
    const standardBody: Omit<typeof body, "service_tier"> & { service_tier?: string } = { ...body };
    delete standardBody.service_tier;
    return openAiJson<OpenAiCvResponse>(input.apiKey, "/v1/responses", {
      method: "POST",
      body: JSON.stringify(standardBody),
    });
  }
}

export async function startInitialCvResponse(input: {
  apiKey: string;
  conversationId: string;
  prebuildId: string;
  generationKey: string;
  files: CvBundleInputFile[];
  model?: string;
  serviceTier?: CvServiceTier;
  maxInputChars?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
}) {
  const content: unknown[] = compactCvBundleFilesForAgent(input.files, input.maxInputChars).map(inputFile);
  content.push({
    type: "input_text",
    text: `Generate the first temporary CV draft for ${input.prebuildId}. Complete the full internal review before replying.`,
  });
  return startResponse({
    apiKey: input.apiKey,
    conversationId: input.conversationId,
    model: input.model,
    instructions: INITIAL_INSTRUCTIONS,
    content,
    serviceTier: input.serviceTier,
    maxOutputTokens: input.maxOutputTokens,
    reasoningEffort: input.reasoningEffort,
    metadata: {
      prebuild_id: input.prebuildId,
      generation_key: input.generationKey,
      turn_kind: "initial",
    },
  });
}

export async function startCvRevisionResponse(input: {
  apiKey: string;
  conversationId: string;
  prebuildId: string;
  generationKey: string;
  message: string;
  currentTex: string;
  currentReview: string;
  model?: string;
  serviceTier?: CvServiceTier;
}) {
  return startResponse({
    apiKey: input.apiKey,
    conversationId: input.conversationId,
    model: input.model,
    instructions: REVISION_INSTRUCTIONS,
    serviceTier: input.serviceTier,
    content: [
      inputFile({ filename: "cv_draft.tex", text: input.currentTex }),
      inputFile({ filename: "cv_review.md", text: input.currentReview }),
      { type: "input_text", text: input.message },
    ],
    metadata: {
      prebuild_id: input.prebuildId,
      generation_key: input.generationKey,
      turn_kind: "revision",
    },
  });
}

export async function retrieveOpenAiCvResponse(apiKey: string, responseId: string) {
  return openAiJson<OpenAiCvResponse>(apiKey, `/v1/responses/${encodeURIComponent(responseId)}`);
}

export function openAiConversationId(response: OpenAiCvResponse) {
  if (typeof response.conversation === "string") return response.conversation;
  return response.conversation?.id || "";
}

export function openAiOutputText(response: OpenAiCvResponse) {
  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) chunks.push(text.trim());
    }
  }
  return chunks.join("\n\n");
}

function collectContainerIds(value: unknown, ids: Set<string>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectContainerIds(item, ids);
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "container_id" && typeof item === "string") ids.add(item);
    else collectContainerIds(item, ids);
  }
}

export function openAiContainerId(response: OpenAiCvResponse) {
  const ids = new Set<string>();
  collectContainerIds(response.output, ids);
  return [...ids][0] || "";
}

export function citedOpenAiContainerFiles(response: OpenAiCvResponse) {
  const files = new Map<string, OpenAiContainerFile>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      typeof record.file_id === "string"
      && typeof record.container_id === "string"
      && typeof record.filename === "string"
    ) {
      files.set(record.file_id, {
        id: record.file_id,
        containerId: record.container_id,
        filename: record.filename,
      });
    }
    for (const item of Object.values(record)) visit(item);
  };
  visit(response.output);
  return [...files.values()];
}

export async function listOpenAiContainerFiles(apiKey: string, containerId: string) {
  const result = await openAiJson<{ data?: Array<{ id?: string; path?: string; filename?: string }> }>(
    apiKey,
    `/v1/containers/${encodeURIComponent(containerId)}/files`,
  );
  return (result.data ?? []).flatMap((file) => file.id ? [{
    id: file.id,
    containerId,
    filename: String(file.filename || file.path || file.id).split("/").at(-1) || file.id,
  }] : []);
}

export async function downloadOpenAiContainerFile(
  apiKey: string,
  containerId: string,
  fileId: string,
) {
  const response = await fetch(
    `https://api.openai.com/v1/containers/${encodeURIComponent(containerId)}/files/${encodeURIComponent(fileId)}/content`,
    { cache: "no-store", headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!response.ok) throw new OpenAiCvError(response.status, "OPENAI_FILE_DOWNLOAD_FAILED");
  return response.arrayBuffer();
}

export function openAiUsage(response: OpenAiCvResponse) {
  return {
    inputTokens: Number(response.usage?.input_tokens ?? 0),
    cachedInputTokens: Number(response.usage?.input_tokens_details?.cached_tokens ?? 0),
    outputTokens: Number(response.usage?.output_tokens ?? 0),
  };
}
