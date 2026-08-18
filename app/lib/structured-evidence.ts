import { containsPhrase, tokenize, type JdRequirement } from "./hybrid-rag.ts";

export type StructuredClassification = "Direct" | "Credential Direct" | "Credential Status Gap" | "Coursework Match";

export type StructuredFactRecord = {
  record_type: "education_credential" | "coursework" | "skill" | "publication" | "professional_service" | "teaching" | "award" | "research_literature" | "conference_participation";
  fact_id: string;
  verified_fact: string;
  evidence_strength: string;
  source_tier: string;
  source: string;
  evidence_location?: string;
  claim_boundary?: string;
  cv_eligible: boolean;
  match_class: string;
  institution?: string;
  degree_level?: string;
  degree_status?: string;
  field?: string;
  course?: string;
  course_status?: string;
  skill?: string;
  capability?: string;
  title?: string;
  publication_status?: string;
  venue?: string;
  authorship?: string;
  conference?: string;
  year?: number;
  conference_role?: string;
  presentation_status?: string;
  normalized_concepts?: string[];
  supporting_fact_ids?: string[];
  supporting_projects?: string[];
  supporting_project?: string;
  retrieval_text: string;
};

export type StructuredCandidate = {
  record: StructuredFactRecord;
  classification: StructuredClassification;
  score: number;
  why: string;
  limitation: string;
};

function unique(values: string[]) { return [...new Set(values.filter(Boolean))]; }

function requirementTerms(requirement: JdRequirement) {
  return unique([requirement.label, ...requirement.literalTerms, ...requirement.evidenceTerms, ...requirement.normalizedConcepts.map((value) => value.replace(/_/g, " "))]);
}

function tokenSimilarity(left: string, right: string) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.sqrt(a.size * b.size);
}

function degreeLevels(text: string) {
  const levels = new Set<string>();
  if (/\b(ph\.?d\.?|doctorate|doctoral degree)\b|博士/i.test(text)) levels.add("PhD");
  if (/\b(m\.?s\.?|master'?s?|master of science)\b|硕士/i.test(text)) levels.add("MS");
  if (/\b(b\.?s\.?|bachelor'?s?|bachelor of science)\b|本科|学士/i.test(text)) levels.add("BS");
  if (/advanced degree|研究生学历/i.test(text)) { levels.add("PhD"); levels.add("MS"); }
  return levels;
}

function acceptedCredentialField(text: string, record: StructuredFactRecord) {
  const field = record.field ?? "";
  if (containsPhrase(text, field)) return true;
  if (/biostatistics|生物统计/i.test(text) && /biostatistics/i.test(field)) return true;
  if (/(^|[^a-z])statistics([^a-z]|$)|统计学|统计专业|数学.{0,4}统计|统计.{0,4}相关/i.test(text) && /^(bio)?statistics$/i.test(field.replace(/\s+/g, ""))) return true;
  if (/quantitative (field|discipline)|related quantitative|定量相关专业|相关量化专业|stem|理工/i.test(text) && /statistics/i.test(field)) return true;
  return false;
}

function credentialCandidates(requirement: JdRequirement, records: StructuredFactRecord[]) {
  const text = requirement.sourceText;
  const levels = degreeLevels(text);
  const fieldRequirement = /statistics|biostatistics|统计|定量|quantitative|stem|理工|computer science|计算机|artificial intelligence|\bai\b|人工智能|information science|信息科学|mathematics|数学|automation|自动化/i.test(text);
  if (requirement.category !== "Education" && !levels.size && !fieldRequirement) return [];
  const explicitCompletion = /completed|conferred|degree awarded|must have (?:a |an )?(?:ph\.?d|doctorate)|已取得|已获得|须持有/i.test(text);
  return records.filter((record) => record.record_type === "education_credential" && (!fieldRequirement || acceptedCredentialField(text, record)))
    .filter((record) => !levels.size || levels.has(record.degree_level ?? ""))
    .map((record): StructuredCandidate => {
      const statusGap = explicitCompletion && /candidate|progress/i.test(record.degree_status ?? "");
      return {
        record,
        classification: statusGap ? "Credential Status Gap" : "Credential Direct",
        score: statusGap ? 78 : 100,
        why: fieldRequirement
          ? "The degree field is matched structurally before semantic project retrieval."
          : "The named degree level is matched structurally without inventing a field requirement.",
        limitation: statusGap ? "The field matches directly, but the PhD is still in progress and the JD explicitly requires a completed degree." : (record.claim_boundary ?? ""),
      };
    });
}

function courseworkCandidates(requirement: JdRequirement, records: StructuredFactRecord[]) {
  if (["Education", "Professional Service", "Teaching", "Awards"].includes(requirement.category)) return [];
  const query = requirementTerms(requirement).join(" ");
  return records.filter((record) => record.record_type === "coursework").map((record) => {
    const concepts = [...(record.normalized_concepts ?? []), record.course ?? ""].join(" ").replace(/_/g, " ");
    const exact = requirementTerms(requirement).some((term) => containsPhrase(concepts, term) || containsPhrase(term, concepts));
    const similarity = tokenSimilarity(query, concepts);
    if (!exact && similarity < 0.45) return null;
    return { record, classification: "Coursework Match" as const, score: Math.round((exact ? 72 : 48 + 24 * similarity) * 10) / 10, why: "A transcript-supported course covers the named topic.", limitation: "Coursework shows academic exposure; it does not by itself establish professional implementation experience." };
  }).filter((candidate): candidate is StructuredCandidate => Boolean(candidate));
}

function peerReviewedPublicationRequirement(requirement: JdRequirement) {
  return /peer.?review|同行评议|高水平.{0,8}(期刊|会议)|发表.{0,8}论文|published publications?/i.test([requirement.label, requirement.sourceText].join(" "));
}

function publicationCandidate(requirement: JdRequirement, record: StructuredFactRecord): StructuredCandidate | null {
  if (record.record_type !== "publication") return null;
  if (!["Communication", "Leadership", "Research"].includes(requirement.category)) return null;
  if (peerReviewedPublicationRequirement(requirement)) {
    if (record.publication_status !== "published") return null;
    return {
      record,
      classification: "Direct",
      score: 98,
      why: "A formally published journal article directly supports a peer-reviewed publication requirement.",
      limitation: "Only formally published papers support this requirement. Under-review or revision manuscripts and reviewer service do not count as published peer-reviewed papers.",
    };
  }
  const terms = requirementTerms(requirement);
  const exact = terms.some((term) => containsPhrase(record.retrieval_text, term) || containsPhrase(term, record.retrieval_text));
  const similarity = tokenSimilarity(terms.join(" "), record.retrieval_text);
  if (!exact && similarity < 0.38) return null;
  if (requirement.label === "Manuscript development" && !/first author|corresponding author/i.test(record.authorship ?? "")) return null;
  return { record, classification: "Direct", score: Math.round((exact ? 92 : 62 + 30 * similarity) * 10) / 10, why: "A structured publication record directly supports this requirement.", limitation: record.claim_boundary ?? "" };
}

function conferenceCandidate(requirement: JdRequirement, record: StructuredFactRecord): StructuredCandidate | null {
  if (record.record_type !== "conference_participation") return null;
  const requirementText = [requirement.label, requirement.sourceText, ...requirement.literalTerms].join(" ");
  if (/presentation|oral|poster|invited talk|speaker|报告|口头|海报|特邀|chair|organizer|主持|组织/i.test(requirementText)) return null;
  if (!/conference|meeting|scientific community|professional engagement|学术会议|会议参与|参会|科研交流/i.test(requirementText)) return null;
  const exact = requirementTerms(requirement).some((term) => containsPhrase(record.retrieval_text, term) || containsPhrase(term, record.retrieval_text));
  const similarity = tokenSimilarity(requirementTerms(requirement).join(" "), record.retrieval_text);
  if (!exact && similarity < 0.3) return null;
  return {
    record,
    classification: "Direct",
    score: Math.round((exact ? 94 : 68 + 26 * similarity) * 10) / 10,
    why: "A structured conference-participation record directly supports conference attendance/scientific-community engagement.",
    limitation: record.claim_boundary ?? "Attendance does not establish a presentation or conference leadership role.",
  };
}

function profileCandidate(requirement: JdRequirement, record: StructuredFactRecord): StructuredCandidate | null {
  if (record.record_type === "publication") return publicationCandidate(requirement, record);
  if (record.record_type === "conference_participation") return conferenceCandidate(requirement, record);
  if (!["skill", "professional_service", "teaching", "award", "research_literature"].includes(record.record_type)) return null;
  const terms = requirementTerms(requirement);
  const text = record.retrieval_text;
  const exact = terms.some((term) => containsPhrase(text, term) || containsPhrase(term, text));
  const similarity = tokenSimilarity(terms.join(" "), text);
  if (record.record_type === "skill") {
    if (!terms.some((term) => containsPhrase(record.skill ?? "", term) || containsPhrase(term, record.skill ?? ""))) return null;
  } else if (record.record_type === "professional_service") {
    if (requirement.category !== "Professional Service" && !/reviewer|peer review|chair|organizer|同行评议|审稿|主持|组织/i.test(requirement.sourceText)) return null;
  } else if (record.record_type === "teaching") {
    if (requirement.category !== "Teaching") return null;
  } else if (record.record_type === "award") {
    if (requirement.category !== "Awards") return null;
  } else if (record.record_type === "research_literature") {
    if (!["Research", "Communication", "Professional Service"].includes(requirement.category)) return null;
    if (/meta-analysis|meta analysis|prisma|prospero|risk.of.bias|hta|regulatory literature|荟萃分析|元分析/i.test(requirement.label)) return null;
  }
  if (!exact && similarity < 0.35 && !["professional_service", "teaching", "award"].includes(record.record_type)) return null;
  return { record, classification: "Direct", score: Math.round((exact ? 92 : 62 + 30 * similarity) * 10) / 10, why: "A structured profile record directly supports this requirement.", limitation: record.claim_boundary ?? "" };
}

export function matchStructuredEvidence(requirement: JdRequirement, records: StructuredFactRecord[]) {
  const credentials = credentialCandidates(requirement, records);
  const coursework = courseworkCandidates(requirement, records);
  const profile = records.map((record) => profileCandidate(requirement, record)).filter((candidate): candidate is StructuredCandidate => Boolean(candidate));
  const rank: Record<StructuredClassification, number> = { Direct: 4, "Credential Direct": 4, "Coursework Match": 2, "Credential Status Gap": 1 };
  return [...credentials, ...profile, ...coursework]
    .sort((a, b) => rank[b.classification] - rank[a.classification] || b.score - a.score)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.record.fact_id === item.record.fact_id) === index)
    .slice(0, 6);
}
