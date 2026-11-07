import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
const { normalizeIncomingJob, ingestJobs, mergeStoredIngestionJob, ignoredJobFingerprint } = await vite.ssrLoadModule("/app/lib/job-ingestion.ts");
after(() => vite.close());
const now = "2026-11-07T10:00:00.000Z";
const content = "PhD statistics clinical trial predictive model Python R SQL. Visa sponsorship available.";
const raw = { company: "Example", title: "Data Scientist", location: "Boston, MA", description: content, job_url: "https://example.com/jobs/12345?utm_source=a" };

function context() {
  const rows = [];
  return { rows, now, ignored: new Set(), rules: [], store: {
    async find() { return rows; },
    async write(job, existing) {
      if (existing) Object.assign(existing, mergeStoredIngestionJob(job, existing));
      else rows.push({ ...job, id: rows.length + 1 });
    },
  } };
}

test("Python source records and in-app candidates use the same normalization and score", () => {
  const python = normalizeIncomingJob({ provider: "jobspy", raw, context: { region: "美国" } }, now);
  const worker = normalizeIncomingJob({ provider: "ats", raw: { company: raw.company, title: raw.title, location: raw.location, content, jobUrl: raw.job_url }, context: { region: "美国" } }, now);
  for (const field of ["company", "title", "location", "description", "canonicalUrl", "applicationId", "region", "score", "skills"]) assert.deepEqual(python[field], worker[field], field);
});

test("shared schema maps raw source aliases, cleans HTML, and handles nested company/location", () => {
  const job = normalizeIncomingJob({ raw: { company: { name: " Example " }, job_title: " Data Scientist ", job_url: raw.job_url, jobLocation: { address: { addressLocality: "Boston", addressRegion: "MA" } }, description: "<script>bad()</script><p>PhD&nbsp;statistics</p>" } }, now);
  assert.equal(job.company, "Example"); assert.equal(job.title, "Data Scientist");
  assert.equal(job.description, "PhD statistics"); assert.equal(job.location, "Boston, MA");
});

test("rejects malformed records and unsafe URLs without writes", async () => {
  const ctx = context();
  const result = await ingestJobs([null, 2, [], {}, { ...raw, job_url: "javascript:alert(1)" }, { ...raw, region: "Mars" }], ctx);
  assert.equal(result.invalid, 6); assert.equal(ctx.rows.length, 0);
});

test("deduplicates a batch, preserves full JD, and retains different requisitions", async () => {
  const ctx = context();
  const result = await ingestJobs([raw, { ...raw, job_url: "https://example.com/jobs/12345?utm_source=b", description: "" }, { ...raw, job_url: "https://example.com/jobs/67890" }], ctx);
  assert.equal(result.created, 2); assert.equal(result.duplicates, 1);
  assert.equal(ctx.rows[0].description, content);
});

test("replaying a Python batch updates rather than creating another row", async () => {
  const ctx = context(); await ingestJobs([raw], ctx);
  const result = await ingestJobs([{ ...raw, description: "", checked_at: "2026-11-08T10:00:00Z" }], ctx);
  assert.equal(result.created, 0); assert.equal(result.updated, 1);
  assert.equal(ctx.rows.length, 1); assert.equal(ctx.rows[0].description, content);
  assert.equal(ctx.rows[0].discoveredAt, now);
});

test("concurrent sources sharing one scan context do not race to insert", async () => {
  const ctx = context();
  const results = await Promise.all([ingestJobs([raw], ctx), ingestJobs([raw], ctx)]);
  assert.equal(results.reduce((n, r) => n + r.created, 0), 1);
  assert.equal(ctx.rows.length, 1);
});

test("ignored jobs and approved exclusions apply equally to both inputs", async () => {
  for (const provider of ["jobspy", "ats"]) {
    const ctx = context(); ctx.ignored.add(ignoredJobFingerprint(raw.company, raw.title));
    assert.equal((await ingestJobs([{ provider, raw }], ctx)).reasons.ignored, 1);
    ctx.ignored.clear(); ctx.rules = [{ kind: "exclude", term: "predictive model" }];
    assert.equal((await ingestJobs([{ provider, raw }], ctx)).reasons.approved_exclusion, 1);
  }
});

test("does not trust client scores or preserve NaN as a score", () => {
  const a = normalizeIncomingJob({ ...raw, score: 100 }, now);
  const b = normalizeIncomingJob({ ...raw, score: "NaN" }, now);
  assert.equal(a.score, b.score); assert.ok(Number.isFinite(a.score));
});

test("Workday transport preserves source paths while backend constructs public URL and reads full JD", () => {
  const job = normalizeIncomingJob({ raw: { title: raw.title, externalPath: "/job/Boston/Data-Scientist_R12345", _detail: { jobPostingInfo: { jobDescription: `<p>${content}</p>` } } }, context: { company: "Example", ats: "workday", baseUrl: "https://example.wd5.myworkdayjobs.com/External" } }, now);
  assert.equal(job.jobUrl, "https://example.wd5.myworkdayjobs.com/en-US/External/job/Boston/Data-Scientist_R12345");
  assert.equal(job.description, content);
});
