import AutofillProfileClient from "./autofill-profile-client";
import { deriveBookmarkCaptureKey } from "../lib/bookmark-capture";

export const dynamic = "force-dynamic";

export default async function AutofillPage() {
  const { env } = await import("cloudflare:workers");
  const accessKey = await deriveBookmarkCaptureKey(String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim());
  return <AutofillProfileClient accessKey={accessKey} />;
}
