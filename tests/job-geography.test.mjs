import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom" });
const { evaluateTodayShortlistCandidate: evaluate } = await vite.ssrLoadModule("/app/lib/job-shortlist.ts");
after(() => vite.close());
const job = { title: "Data Scientist", region: "美国", score: 0, status: "开放",
description: "Responsibilities: statistics and Python analysis. Qualifications: statistical research. ".repeat(4) };
test("Europe and Africa locations excluded even when source labels region as US", () => {
for (const location of ["London", "Remote - Europe", "Berlin, Germany", "Paris, FR", "法国巴黎", "South Africa", "Nairobi", "Kenya", "Remote (UK)", "Nigeria", "苏黎世", "Warsaw, Poland"]) {
 const result = evaluate({ ...job, location });
 assert.equal(result.eligible, false, location);
 assert.ok(result.blockers.some((x) => x.includes("欧洲或非洲")), location);
}
});
test("US, China, unknown and global remote retained; JD mentions do not control geography", () => {
for (const location of ["Cambridge, MA", "Paris, TX", "London, Ontario", "Arlington, VA", "Boston, MA", "New York, NY", "Shanghai, China", "Remote", "", "Singapore"]) {
 assert.equal(evaluate({ ...job, location, description: job.description + " We have offices in Europe and Africa." }).eligible, true, location);
}
});
