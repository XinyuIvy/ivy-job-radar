type JsonRecord = Record<string, unknown>;

function parseJsonl(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRecord);
}

function projectKey(record: JsonRecord) {
  return String(record.record_id ?? record.project_id ?? record.entity_id ?? "").trim();
}

function nonEmpty(value: unknown) {
  return value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "");
}

function currentProjectMetadata(record: JsonRecord) {
  const fields = [
    "project_name",
    "project_type",
    "role",
    "status",
    "start_date",
    "end_date",
    "city",
    "country",
    "claim_boundary",
    "display_name_rule",
    "display_location_en",
    "display_location_zh",
    "work_mode",
    "relationship_note",
    "date_boundary",
    "literature_review_boundary",
  ] as const;
  const result: JsonRecord = {};
  for (const field of fields) {
    const explicitEmptyLocation = (field === "city" || field === "country")
      && Object.prototype.hasOwnProperty.call(record, field);
    if (nonEmpty(record[field]) || explicitEmptyLocation) result[field] = record[field];
  }
  return result;
}

/**
 * Build the project snapshot consumed by a new PRECV/APP bundle.
 *
 * Historical CANONICAL_PROJECT_INDEX remains immutable in the CV repository.
 * For a frozen current bundle we merge, in order:
 *   baseline canonical project -> current canonical project amendment -> current PROJECT_INDEX metadata.
 * This keeps rich canonical evidence boundaries while making the project snapshot itself current for
 * dates, locations, display names and user-confirmed project metadata.
 */
export function buildEffectiveCanonicalProjectIndex(input: {
  baselineText: string;
  currentAddendumText: string;
  currentProjectMetadataText: string;
}) {
  const baseline = parseJsonl(input.baselineText).filter((record) => record.record_type === "project");
  const amendments = parseJsonl(input.currentAddendumText)
    .filter((record) => record.record_type === "project");
  const metadata = parseJsonl(input.currentProjectMetadataText);

  const amendmentByKey = new Map<string, JsonRecord>();
  for (const record of amendments) {
    const key = projectKey(record);
    if (key) amendmentByKey.set(key, record);
    const projectId = String(record.project_id ?? "").trim();
    if (projectId) amendmentByKey.set(`project:${projectId}`, record);
  }
  const metadataByProjectId = new Map<string, JsonRecord>();
  for (const record of metadata) {
    const projectId = String(record.project_id ?? "").trim();
    if (projectId) metadataByProjectId.set(projectId, record);
  }

  const seen = new Set<string>();
  const output: JsonRecord[] = [];
  const materialize = (base: JsonRecord) => {
    const projectId = String(base.project_id ?? base.entity_id ?? "").trim();
    const canonicalKey = String(base.record_id ?? (projectId ? `project:${projectId}` : "")).trim();
    const amendment = amendmentByKey.get(canonicalKey)
      ?? (projectId ? amendmentByKey.get(`project:${projectId}`) : undefined)
      ?? {};
    const projectMetadata = projectId ? metadataByProjectId.get(projectId) ?? {} : {};
    const merged: JsonRecord = {
      ...base,
      ...amendment,
      ...currentProjectMetadata(projectMetadata),
    };
    if (projectId) {
      merged.project_id = projectId;
      merged.entity_id = String(merged.entity_id ?? projectId);
      merged.record_id = String(merged.record_id ?? `project:${projectId}`);
    }
    const retrievalFields = {
      ...(typeof base.retrieval_fields === "object" && base.retrieval_fields ? base.retrieval_fields as JsonRecord : {}),
      ...(typeof amendment.retrieval_fields === "object" && amendment.retrieval_fields ? amendment.retrieval_fields as JsonRecord : {}),
    };
    if (merged.project_name) retrievalFields.project_name = merged.project_name;
    if (Object.keys(retrievalFields).length) merged.retrieval_fields = retrievalFields;
    return merged;
  };

  for (const record of baseline) {
    const merged = materialize(record);
    const key = projectKey(merged);
    if (key) seen.add(key);
    output.push(merged);
  }

  for (const amendment of amendments) {
    const key = projectKey(amendment);
    const projectId = String(amendment.project_id ?? amendment.entity_id ?? "").trim();
    const baselineKey = projectId ? `project:${projectId}` : key;
    if (!key || seen.has(key) || seen.has(baselineKey)) continue;
    const merged = materialize(amendment);
    seen.add(projectKey(merged));
    output.push(merged);
  }

  return `${output.map((record) => JSON.stringify(record)).join("\n")}\n`;
}
