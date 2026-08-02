import BookmarkletInstaller from "./bookmarklet-installer";
import { deriveBookmarkCaptureKey } from "../lib/bookmark-capture";

export const dynamic = "force-dynamic";

export default async function BookmarkletPage() {
  const { env } = await import("cloudflare:workers");
  const captureKey = await deriveBookmarkCaptureKey(String(env.IVY_JOB_RADAR_SYNC_TOKEN ?? "").trim());
  return <BookmarkletInstaller captureKey={captureKey} />;
}
