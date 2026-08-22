"use client";

import { useEffect } from "react";

type RequestItem = { id: number; company: string; title: string; status: string; jobUrl: string };
type QualityIssue = { jobId: number; company: string; title: string; automationStatus: string };
type ApplicationRow = { company: string; title: string; status: string };

const JOB_CACHE_KEY = "ivy-job-radar:jobs-cache:v1";
const JOB_CACHE_TIME_KEY = "ivy-job-radar:jobs-cache-time:v1";
const APPROVAL_KEY = "ivy-job-radar:last-approved-job";

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/&/g, "and").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function key(company: string, title: string) {
  return `${normalize(company)}::${normalize(title)}`;
}

function verifyViewActive() {
  const title = document.querySelector<HTMLElement>(".hero h1")?.textContent?.trim() || "";
  return title === "岗位核验";
}

function button(label: string, tone: "approve" | "neutral" | "danger" | "quiet") {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.dataset.manualReviewButton = "true";
  element.style.borderRadius = "999px";
  element.style.padding = "9px 14px";
  element.style.fontWeight = "800";
  element.style.cursor = "pointer";
  element.style.border = tone === "quiet" ? "1px solid #d9bbb6" : "0";
  element.style.background = tone === "approve" ? "#16794b" : tone === "danger" ? "#a33f35" : tone === "neutral" ? "#e8e4d9" : "transparent";
  element.style.color = tone === "approve" || tone === "danger" ? "#fff" : tone === "quiet" ? "#7c4c47" : "#26342d";
  return element;
}

async function refreshJobsCache() {
  const response = await fetch("/api/jobs", { cache: "no-store" });
  if (!response.ok) return [];
  const rows = await response.json().catch(() => null);
  if (!Array.isArray(rows)) return [];
  try {
    sessionStorage.setItem(JOB_CACHE_KEY, JSON.stringify(rows));
    sessionStorage.setItem(JOB_CACHE_TIME_KEY, String(Date.now()));
  } catch {}
  return rows as Array<{ company?: string; title?: string; jobUrl?: string }>;
}

export default function VerificationQueueActions() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    let scheduled = false;
    let lastRunAt = 0;

    const enhance = async () => {
      scheduled = false;
      if (disposed || !verifyViewActive()) return;
      const now = Date.now();
      if (now - lastRunAt < 1000) return;
      lastRunAt = now;
      const [requestResponse, applicationResponse, qualityResponse] = await Promise.all([
        fetch("/api/job-requests", { cache: "no-store" }),
        fetch("/api/applications", { cache: "no-store" }),
        fetch("/api/data-quality", { cache: "no-store" }),
      ]);
      if (disposed) return;
      const requests = requestResponse.ok ? await requestResponse.json() as RequestItem[] : [];
      const applications = applicationResponse.ok ? await applicationResponse.json() as ApplicationRow[] : [];
      const qualityPayload = qualityResponse.ok ? await qualityResponse.json() as { issues?: QualityIssue[] } : { issues: [] };
      const qualityIssues = (qualityPayload.issues ?? []).filter((item) => item.automationStatus === "needs_review");
      const pendingKeys = new Set(applications.filter((row) => row.status === "准备材料").map((row) => key(row.company, row.title)));
      const requestByKey = new Map(requests.map((item) => [key(item.company, item.title), item]));
      const qualityByKey = new Map(qualityIssues.map((item) => [key(item.company, item.title), item]));
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".request-list .request-card"));

      for (const card of cards) {
        const title = card.querySelector("h3")?.textContent?.trim() ?? "";
        const company = card.querySelector("h3 + p")?.textContent?.trim() ?? card.querySelector("div > p")?.textContent?.trim() ?? "";
        const cardKey = key(company, title);
        if (pendingKeys.has(cardKey)) {
          card.style.setProperty("display", "none", "important");
          continue;
        }
        const status = card.querySelector(".verify-status")?.textContent?.trim() ?? "";
        if (status !== "需复核") continue;
        const actions = card.querySelector<HTMLElement>(".record-actions");
        if (!actions || actions.dataset.manualReviewEnhanced === "true") continue;
        const requestItem = requestByKey.get(cardKey);
        const qualityItem = qualityByKey.get(cardKey);
        if (!requestItem && !qualityItem) continue;
        actions.dataset.manualReviewEnhanced = "true";
        actions.querySelectorAll("button").forEach((existing) => existing.remove());

        const run = async (action: "approve" | "ignore" | "delete" | "rerun") => {
          const prompts = {
            approve: `确认人工通过 ${company} · ${title} 吗？`,
            ignore: `确认将 ${company} · ${title} 加入不再推荐吗？`,
            delete: "确认仅删除这条核验记录吗？该岗位未来仍可能再次出现。",
            rerun: `确认重新核验 ${company} · ${title} 吗？`,
          };
          if (!window.confirm(prompts[action])) return;

          const previousDisplay = card.style.display;
          if (action !== "rerun") card.style.setProperty("display", "none", "important");
          else actions.querySelectorAll<HTMLButtonElement>("button").forEach((item) => { item.disabled = true; });

          const result = requestItem
            ? action === "rerun"
              ? await fetch("/api/job-requests", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: requestItem.id }) })
              : await fetch("/api/manual-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: requestItem.id, action }) })
            : await fetch("/api/quality-manual-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: qualityItem?.jobId, action }) });

          if (!result.ok) {
            card.style.display = previousDisplay;
            actions.querySelectorAll<HTMLButtonElement>("button").forEach((item) => { item.disabled = false; });
            const payload = await result.json().catch(() => ({})) as { error?: string };
            window.alert(payload.error || "操作失败，请稍后重试。");
            return;
          }

          if (action === "approve") {
            void refreshJobsCache().then((rows) => {
              const approved = rows.find((row) => key(row.company || "", row.title || "") === cardKey) || { company, title, jobUrl: requestItem?.jobUrl || "" };
              try { localStorage.setItem(APPROVAL_KEY, JSON.stringify({ ...approved, sentAt: Date.now() })); } catch {}
              window.dispatchEvent(new CustomEvent("ivy-job-radar-approved", { detail: approved }));
              window.dispatchEvent(new CustomEvent("ivy-job-radar:jobs-updated", { detail: rows }));
            });
          } else if (action === "rerun") {
            actions.dataset.manualReviewEnhanced = "false";
            actions.querySelectorAll<HTMLButtonElement>("button").forEach((item) => { item.disabled = false; });
            window.setTimeout(schedule, 120);
          }
        };

        const approve = button("人工通过", "approve"); approve.addEventListener("click", () => void run("approve"));
        const rerun = button("重新核验", "neutral"); rerun.addEventListener("click", () => void run("rerun"));
        const ignore = button("不再推荐", "danger"); ignore.addEventListener("click", () => void run("ignore"));
        const remove = button("仅删除记录", "quiet"); remove.addEventListener("click", () => void run("delete"));
        actions.append(approve, rerun, ignore, remove);
      }
    };

    const schedule = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      window.setTimeout(() => void enhance(), 80);
    };
    schedule();
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", schedule);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("focus", schedule);
    };
  }, []);
  return null;
}
