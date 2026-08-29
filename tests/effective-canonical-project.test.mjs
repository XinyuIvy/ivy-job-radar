import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const { buildEffectiveCanonicalProjectIndex } = await vite.ssrLoadModule("/app/lib/effective-canonical-project.ts");

after(async () => {
  await vite.close();
});

test("current amendment and PROJECT_INDEX metadata override stale baseline project fields", () => {
  const baseline = [
    {
      record_id: "project:semiparametric_confidence_sets",
      record_type: "project",
      project_id: "semiparametric_confidence_sets",
      project_name: "Semiparametric Confidence Sets",
      ownership: ["co_first_corresponding_methodology"],
      retrieval_fields: { category: "lead_research", project_name: "Semiparametric Confidence Sets" },
    },
    {
      record_id: "project:ivy_job_radar",
      record_type: "project",
      project_id: "ivy_job_radar",
      project_name: "Ivy Job Radar",
      ownership: ["independent_software_owner"],
    },
  ].map((row) => JSON.stringify(row)).join("\n");
  const addendum = [
    {
      record_id: "project:semiparametric_confidence_sets",
      record_type: "project",
      project_id: "semiparametric_confidence_sets",
      project_name: "Semiparametric Confidence Sets",
      ownership: ["first_author_corresponding_author"],
      status: "completed_published",
    },
    {
      record_id: "project:ivy_job_radar",
      record_type: "project",
      project_id: "ivy_job_radar",
      project_name: "Job Radar",
      ownership: ["product_and_workflow_owner_ai_assisted_implementation"],
      status: "implemented_current",
    },
  ].map((row) => JSON.stringify(row)).join("\n");
  const metadata = [
    {
      project_id: "semiparametric_confidence_sets",
      project_name: "Semiparametric Confidence Sets for Cross-sectional and Longitudinal Neuroimaging",
      role: "first author; corresponding author",
      start_date: "2023-08",
      end_date: "2025-08",
      city: "Nashville",
      country: "USA",
    },
    {
      project_id: "ivy_job_radar",
      project_name: "Job Radar",
      display_name_rule: "Use Job Radar only",
      city: "Nashville",
      country: "USA",
    },
  ].map((row) => JSON.stringify(row)).join("\n");

  const rows = buildEffectiveCanonicalProjectIndex({
    baselineText: baseline,
    currentAddendumText: addendum,
    currentProjectMetadataText: metadata,
  }).trim().split("\n").map((line) => JSON.parse(line));

  const semiparametric = rows.find((row) => row.project_id === "semiparametric_confidence_sets");
  assert.deepEqual(semiparametric.ownership, ["first_author_corresponding_author"]);
  assert.equal(semiparametric.start_date, "2023-08");
  assert.equal(semiparametric.end_date, "2025-08");
  assert.equal(semiparametric.city, "Nashville");
  assert.equal(semiparametric.country, "USA");
  assert.equal(semiparametric.role, "first author; corresponding author");
  assert.equal(semiparametric.retrieval_fields.project_name, "Semiparametric Confidence Sets for Cross-sectional and Longitudinal Neuroimaging");

  const radar = rows.find((row) => row.project_id === "ivy_job_radar");
  assert.equal(radar.project_name, "Job Radar");
  assert.equal(radar.city, "Nashville");
  assert.equal(radar.country, "USA");
  assert.deepEqual(radar.ownership, ["product_and_workflow_owner_ai_assisted_implementation"]);
  assert.doesNotMatch(JSON.stringify(radar), /"project_name":"Ivy Job Radar"/);
});

test("explicit Remote project metadata keeps city and country empty", () => {
  const baseline = JSON.stringify({
    record_id: "project:markov_switching_matrix_autoregressive",
    record_type: "project",
    project_id: "markov_switching_matrix_autoregressive",
    project_name: "Markov Switching Matrix Autoregressive Model",
  });
  const metadata = JSON.stringify({
    project_id: "markov_switching_matrix_autoregressive",
    work_mode: "remote",
    display_location_en: "Remote",
    city: "",
    country: "",
  });
  const [row] = buildEffectiveCanonicalProjectIndex({
    baselineText: baseline,
    currentAddendumText: "",
    currentProjectMetadataText: metadata,
  }).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(row.city, "");
  assert.equal(row.country, "");
  assert.equal(row.display_location_en, "Remote");
});
