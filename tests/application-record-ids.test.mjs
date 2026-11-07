import assert from "node:assert/strict";
import test, { after } from "node:test";

import { createServer } from "vite";

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});
const { resolveApplicationRecordIds } = await vite.ssrLoadModule("/app/lib/application-archive.ts");

after(async () => {
  await vite.close();
});

test("generates a stable internal APP id while preserving an employer requisition id", () => {
  const resolved = resolveApplicationRecordIds({
    id: 100,
    company: "Microsoft",
    applicationId: "1970393556960977",
    archiveId: "",
  });

  assert.match(resolved.archiveId, /^APP-\d{4}-MIC-0100$/);
  assert.equal(resolved.applicationId, "1970393556960977");
});

test("recovers a legacy APP id from the employer id column", () => {
  assert.deepEqual(resolveApplicationRecordIds({
    id: 5,
    company: "OURA",
    applicationId: "app-2026-our-0005",
    archiveId: "",
  }), {
    archiveId: "APP-2026-OUR-0005",
    applicationId: "",
  });
});

test("keeps an existing archive id and a distinct employer requisition id", () => {
  assert.deepEqual(resolveApplicationRecordIds({
    id: 71,
    company: "Amgen",
    applicationId: "R-246426",
    archiveId: "APP-2026-AMG-0071",
  }), {
    archiveId: "APP-2026-AMG-0071",
    applicationId: "R-246426",
  });
});
