import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  configFile: false, server: { middlewareMode: true, hmr: false }, appType: "custom",
  plugins: [{ name: "ingestion-auth-fixture",
    resolveId(id) { if (id === "cloudflare:workers") return "\0ingestion-env"; },
    load(id) { if (id === "\0ingestion-env") return 'export const env = { IVY_JOB_RADAR_SYNC_TOKEN: "test-only-token" };'; },
  }],
});
const { POST } = await vite.ssrLoadModule("/app/api/jobs/import/route.ts");
const legacy = await vite.ssrLoadModule("/app/api/jobs/import-learned/route.ts");
after(() => vite.close());
function request(body, token = "test-only-token") {
  return new Request("https://example.com/api/jobs/import", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body });
}
test("rejects unauthorized imports before parsing payload or touching D1", async () => {
  assert.equal((await POST(request("not JSON", "incorrect"))).status, 401);
});
test("authenticated malformed JSON receives 400 rather than failing in middleware", async () => {
  assert.equal((await POST(request("not JSON"))).status, 400);
});
test("requires a job array and rejects oversized batches before D1", async () => {
  assert.equal((await POST(request('{"jobs":"incorrect"}'))).status, 400);
  assert.equal((await POST(request(JSON.stringify(Array(501).fill({}))))).status, 413);
});
test("legacy learned-import URL uses the same authenticated handler", () => {
  assert.equal(legacy.POST, POST);
});
