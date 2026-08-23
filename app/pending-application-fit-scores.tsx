"use client";

import { useEffect } from "react";

import {
  calculateApplicationFactFit,
  type ApplicationFactFitScore,
  type FitMatchInput,
} from "./lib/application-fit-score";

type JobPrefill = {
  jobId: number;
  track: string;
  language: "en" | "zh";
  jd: string;
};

type AnalysisResponse = {
  matches?: FitMatchInput[];
  error?: string;
};

type CacheEntry = {
  version: 2;
  score: ApplicationFactFitScore;
};

const CACHE_PREFIX = "ivy-job-radar:fact-fit-job:v2:";
const MAX_CONCURRENT = 2;

function cacheKey(jobId: number) {
  return `${CACHE_PREFIX}${jobId}`;
}

function readCache(jobId: number) {
  try {
    const raw = localStorage.getItem(cacheKey(jobId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    return parsed.version === 2 && parsed.score ? parsed.score : null;
  } catch {
    return null;
  }
}

function writeCache(jobId: number, score: ApplicationFactFitScore) {
  try {
    const value: CacheEntry = { version: 2, score };
    localStorage.setItem(cacheKey(jobId), JSON.stringify(value));
  } catch {}
}

function clearCache(jobId: number) {
  try { localStorage.removeItem(cacheKey(jobId)); } catch {}
}

function scoreTone(score: number) {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function scoreTitle(score: ApplicationFactFitScore) {
  const lines = [
    `事实覆盖 ${score.evidenceCoverage}`,
    `Direct ${score.directCoverage}`,
    `可迁移 ${score.transferableCoverage}`,
    `当前 CV ${score.cvCoverage}`,
    `Gap 风险 ${score.gapRisk}`,
  ];
  if (score.topMatches.length) lines.push(`最强命中：${score.topMatches.join("、")}`);
  if (score.gaps.length) lines.push(`主要缺口：${score.gaps.join("、")}`);
  return lines.join("。");
}

function renderLoading(element: HTMLElement) {
  element.className = "fact-fit-inline fact-fit-loading";
  element.textContent = "事实库评分中…";
  element.title = "正在使用 Fact Master Match 读取事实库评分。";
}

function renderScore(element: HTMLElement, score: ApplicationFactFitScore) {
  element.className = `fact-fit-inline fact-fit-${scoreTone(score.score)}`;
  element.textContent = `${score.score} · ${score.label} · 重新评分`;
  element.title = `${scoreTitle(score)}。点击这里重新评分。`;
  element.dataset.factFitState = "ready";
}

function renderMessage(element: HTMLElement, message: string, tone: "missing" | "error") {
  element.className = `fact-fit-inline fact-fit-${tone}`;
  element.textContent = tone === "missing" ? "待补完 JD" : "评分失败";
  element.title = message;
  element.dataset.factFitState = tone;
}

function installStyles() {
  if (document.getElementById("candidate-fact-fit-styles")) return;
  const style = document.createElement("style");
  style.id = "candidate-fact-fit-styles";
  style.textContent = `
    .fact-fit-inline { font-weight: 700; font-variant-numeric: tabular-nums; }
    .fact-fit-inline[data-fact-fit-state="ready"] { cursor: pointer; }
    .fact-fit-high { color: #155942; }
    .fact-fit-medium { color: #8a5c0d; }
    .fact-fit-low, .fact-fit-error { color: #a34135; }
    .fact-fit-loading, .fact-fit-missing { color: #718077; font-weight: 600; }
  `;
  document.head.append(style);
}

export default function CandidateFactFitScores() {
  useEffect(() => {
    installStyles();
    let disposed = false;
    let activeCount = 0;
    const queued = new Set<number>();
    const running = new Set<number>();
    const queue: Array<() => Promise<void>> = [];

    const pump = () => {
      if (disposed) return;
      while (activeCount < MAX_CONCURRENT && queue.length) {
        const task = queue.shift();
        if (!task) break;
        activeCount += 1;
        void task().finally(() => {
          activeCount -= 1;
          pump();
        });
      }
    };

    const scoreJob = async (jobId: number, element: HTMLElement, force = false) => {
      if (running.has(jobId)) return;
      running.add(jobId);
      renderLoading(element);
      try {
        if (!force) {
          const localScore = readCache(jobId);
          if (localScore) {
            renderScore(element, localScore);
            return;
          }
          const storedResponse = await fetch(`/api/cv-tailor/job-score?jobId=${jobId}`, { cache: "no-store" });
          if (storedResponse.ok) {
            const stored = await storedResponse.json() as { score?: ApplicationFactFitScore | null };
            if (stored.score) {
              writeCache(jobId, stored.score);
              renderScore(element, stored.score);
              return;
            }
          }
        }

        const jobResponse = await fetch(`/api/cv-tailor/job?jobId=${jobId}`, { cache: "no-store" });
        const job = await jobResponse.json() as JobPrefill & { error?: string };
        if (!jobResponse.ok) throw new Error(job.error || "无法读取岗位信息。");
        const jd = String(job.jd || "").trim();
        if (!jd) {
          renderMessage(element, "该岗位没有可用的完整 JD，暂时无法使用事实库评分。", "missing");
          return;
        }

        const analysisResponse = await fetch("/api/cv-tailor/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track: job.track, language: job.language, jd }),
        });
        const analysis = await analysisResponse.json() as AnalysisResponse;
        if (!analysisResponse.ok) throw new Error(analysis.error || "事实库匹配失败。");
        const score = calculateApplicationFactFit(Array.isArray(analysis.matches) ? analysis.matches : []);
        writeCache(jobId, score);
        renderScore(element, score);
        void fetch("/api/cv-tailor/job-score", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, score }),
          keepalive: true,
        });
      } catch (error) {
        renderMessage(
          element,
          error instanceof Error ? error.message : "事实库匹配失败。",
          "error",
        );
      } finally {
        running.delete(jobId);
      }
    };

    const enqueue = (jobId: number, element: HTMLElement, force = false) => {
      if (queued.has(jobId) || (!force && element.dataset.factFitState === "ready")) return;
      queued.add(jobId);
      queue.push(async () => {
        try {
          await scoreJob(jobId, element, force);
        } finally {
          queued.delete(jobId);
        }
      });
      pump();
    };

    const viewportObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        const jobId = Number(element.dataset.factFitJob);
        if (Number.isSafeInteger(jobId) && jobId > 0) enqueue(jobId, element);
        viewportObserver.unobserve(element);
      }
    }, { rootMargin: "600px" });

    const enhance = () => {
      if (disposed) return;
      for (const element of document.querySelectorAll<HTMLElement>("[data-fact-fit-job]")) {
        if (element.dataset.factFitObserved === "true") continue;
        element.dataset.factFitObserved = "true";
        const jobId = Number(element.dataset.factFitJob);
        const cached = Number.isSafeInteger(jobId) ? readCache(jobId) : null;
        if (cached) {
          renderScore(element, cached);
          continue;
        }
        renderLoading(element);
        viewportObserver.observe(element);
      }
    };

    const refreshScore = (event: MouseEvent) => {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-fact-fit-job]")
        : null;
      if (!target || target.dataset.factFitState !== "ready") return;
      const jobId = Number(target.dataset.factFitJob);
      if (!Number.isSafeInteger(jobId) || jobId <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      clearCache(jobId);
      target.dataset.factFitState = "refreshing";
      enqueue(jobId, target, true);
    };

    enhance();
    document.addEventListener("click", refreshScore, true);
    window.addEventListener("ivy-job-radar-candidate-rendered", enhance);
    window.addEventListener("focus", enhance);

    return () => {
      disposed = true;
      queue.length = 0;
      viewportObserver.disconnect();
      document.removeEventListener("click", refreshScore, true);
      window.removeEventListener("ivy-job-radar-candidate-rendered", enhance);
      window.removeEventListener("focus", enhance);
    };
  }, []);

  return null;
}
