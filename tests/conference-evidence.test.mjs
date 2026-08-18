import assert from "node:assert/strict";
import test from "node:test";

import { matchStructuredEvidence } from "../app/lib/structured-evidence.ts";

function requirement(label, category, sourceText, literalTerms = []) {
  return {
    requirementId: "JD-R001",
    label,
    category,
    sourceText,
    literalTerms,
    normalizedConcepts: [],
    evidenceTerms: literalTerms,
    hardRequirement: false,
    importance: "medium",
    scopes: [],
    namedTool: false,
  };
}

const attendance = {
  record_type: "conference_participation",
  fact_id: "CONF-JSM-2026",
  verified_fact: "Attended JSM 2026.",
  evidence_strength: "high",
  source_tier: "user_confirmed_provenance",
  source: "user confirmation",
  claim_boundary: "Attendance does not establish a presentation or conference leadership role.",
  cv_eligible: true,
  match_class: "conference_participation_direct",
  conference: "JSM",
  year: 2026,
  conference_role: "attendee",
  presentation_status: "not_established_by_this_record",
  normalized_concepts: ["conference_participation", "scientific_conference"],
  retrieval_text: "Attended JSM 2026 | Joint Statistical Meetings | conference participation | scientific conference attendance",
};

const organizer = {
  record_type: "professional_service",
  fact_id: "SERVICE-SMI-ORG-2025",
  verified_fact: "Organized the 2025 Statistical Methods in Imaging session.",
  evidence_strength: "high",
  source_tier: "user_confirmed_provenance",
  source: "user confirmation",
  claim_boundary: "Does not imply conference-wide organizing-chair responsibility.",
  cv_eligible: true,
  match_class: "professional_service_direct",
  normalized_concepts: ["session_organizer", "conference_organization"],
  retrieval_text: "session organizer Statistical Methods in Imaging 2025 | conference session organization",
};

const chair = {
  record_type: "professional_service",
  fact_id: "SERVICE-ENAR-CHAIR-2026",
  verified_fact: "Chaired an ENAR 2026 session.",
  evidence_strength: "high",
  source_tier: "user_confirmed_provenance",
  source: "user confirmation",
  claim_boundary: "Does not imply conference-wide chair responsibility.",
  cv_eligible: true,
  match_class: "professional_service_direct",
  normalized_concepts: ["session_chair", "conference_moderation"],
  retrieval_text: "session chair ENAR 2026 | chaired a session | conference moderation",
};

test("conference attendance is Direct for participation", () => {
  const candidates = matchStructuredEvidence(
    requirement("Conference participation", "Professional Service", "参加过学术会议", ["学术会议"]),
    [attendance],
  );
  assert.equal(candidates[0]?.classification, "Direct");
  assert.equal(candidates[0]?.record.fact_id, "CONF-JSM-2026");
});

test("conference attendance never proves a presentation", () => {
  const candidates = matchStructuredEvidence(
    requirement("Conference presentation", "Communication", "有国际会议口头报告经历", ["口头报告"]),
    [attendance],
  );
  assert.equal(candidates.length, 0);
});

test("session organizer and chair are independent Direct service evidence", () => {
  const org = matchStructuredEvidence(
    requirement("Session organizer", "Professional Service", "有 session organizer / 会议分会组织经验", ["session organizer"]),
    [organizer, chair],
  );
  assert.equal(org[0]?.record.fact_id, "SERVICE-SMI-ORG-2025");
  assert.equal(org[0]?.classification, "Direct");

  const chaired = matchStructuredEvidence(
    requirement("Session chair", "Professional Service", "有 session chair / 会议主持经验", ["session chair"]),
    [organizer, chair],
  );
  assert.equal(chaired[0]?.record.fact_id, "SERVICE-ENAR-CHAIR-2026");
  assert.equal(chaired[0]?.classification, "Direct");
});
