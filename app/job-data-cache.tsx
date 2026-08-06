"use client";

import { useEffect } from "react";

const CACHE_KEY = "ivy-job-radar:jobs-cache:v1";
const CACHE_TIME_KEY = "ivy-job-radar:jobs-cache-time:v1";
const MAX_AGE_MS = 30 * 60 * 1000;

type CachedJobs = unknown[];

function readCache(): CachedJobs | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const savedAt = Number(sessionStorage.getItem(CACHE_TIME_KEY) || 0);
    if (!raw || !savedAt || Date.now() - savedAt > MAX_AGE_MS) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(rows: unknown[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    sessionStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
  } catch {
    // Ignore storage quota or privacy-mode failures.
  }
}

function clearCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem(CACHE_TIME_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function removeCachedJob(company: string, title: string) {
  const cached = readCache();
  if (!cached) return;
  const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
  writeCache(cached.filter((row) => {
    const item = row as { company?: string; title?: string };
    return !(normalize(item.company) === normalize(company) && normalize(item.title) === normalize(title));
  }));
}

export default function JobDataCache() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const isJobsRead = method === "GET" && (url === "/api/jobs" || url.startsWith("/api/jobs?"));

      if (isJobsRead) {
        const cached = readCache();
        if (cached) {
          void nativeFetch(input, init).then(async (response) => {
            if (!response.ok) return;
            const rows = await response.clone().json().catch(() => null);
            if (Array.isArray(rows)) writeCache(rows);
          }).catch(() => undefined);
          return new Response(JSON.stringify(cached), {
            status: 200,
            headers: { "Content-Type": "application/json", "X-Ivy-Cache": "session" },
          });
        }
      }

      const response = await nativeFetch(input, init);
      if (isJobsRead && response.ok) {
        const rows = await response.clone().json().catch(() => null);
        if (Array.isArray(rows)) writeCache(rows);
      }

      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)
        && (url.startsWith("/api/jobs") || url.startsWith("/api/ignored-jobs"))) {
        clearCache();
      }
      return response;
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  return null;
}
