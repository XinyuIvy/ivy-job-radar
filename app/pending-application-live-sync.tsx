"use client";

import { useEffect } from "react";

type PendingMessage = {
  type?: string;
  application?: { id?: number; company?: string; title?: string };
  sentAt?: number;
};

const CHANNEL_NAME = "ivy-job-radar-updates";
const STORAGE_KEY = "ivy-job-radar:last-pending-created";
const REFRESH_EVENT = "ivy-job-radar:pending-refresh";

export default function PendingApplicationLiveSync() {
  useEffect(() => {
    const notify = (message?: PendingMessage) => {
      if (message && message.type !== "ivy-job-radar-pending-created") return;
      window.dispatchEvent(new CustomEvent(REFRESH_EVENT, { detail: message?.application ?? null }));
    };
    const windowHandler = (event: MessageEvent<PendingMessage>) => {
      if (event.origin !== window.location.origin) return;
      notify(event.data);
    };
    const storageHandler = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { notify(JSON.parse(event.newValue) as PendingMessage); } catch {}
    };
    const focusHandler = () => notify();
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") notify();
    };

    window.addEventListener("message", windowHandler);
    window.addEventListener("storage", storageHandler);
    window.addEventListener("focus", focusHandler);
    document.addEventListener("visibilitychange", visibilityHandler);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    if (channel) channel.onmessage = (event: MessageEvent<PendingMessage>) => notify(event.data);

    return () => {
      window.removeEventListener("message", windowHandler);
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener("focus", focusHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      channel?.close();
    };
  }, []);
  return null;
}
