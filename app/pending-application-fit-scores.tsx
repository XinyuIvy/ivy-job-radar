"use client";

import { useEffect } from "react";

import {
  calculateApplicationFactFit,
  type ApplicationFactFitScore,
  type FitMatchInput,
} from "./lib/application-fit-score";

type ApplicationPrefill = {
  applicationId: number;
  track: string;
  language: "en" | "zh";
  jd: string;
  resumeVersion?: string;
};

type AnalysisResponse = {
  matches?: FitMatchInput[];
  error?: string;
  code?: string;
};

type CacheEntry = {
  version: 1;
  fingerprint: string;
  calculatedAt: number;
  score: ApplicationFactFitScore;
};

const CACHE_PREFIX = "ivy-job-radar:fact-fit:v1:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CONCURRENT = 2;

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function pendingTabIsActive() {
  const heroTitle = Array.from(document.querySelectorAll<HTMLElement>(".hero h1"))
    .find((element) => element.offsetParent !== null);
  if (normalized(heroTitle?.textContent || "") !== "收藏与待提交") return false;
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".stats-two button.active"))
    .some((button) => normalized(button.textContent || "").startsWith("待提交申请"));
}

function applicationIdFromCard(card: HTMLElement) {
  const link = card.querySelector<HTMLAnchorElement>('a[data-cv-tailor-action="true"], a[href^="/cv-tailor?applicationId="]');
  if (!link) return null;
  try {
    const url = new URL(link.href, window.location.origin);
    const id = Number(url.searchParams.get("applicationId"));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function hashText(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cacheKey(applicationId: number) {
  return `${CACHE_PREFIX}${applicationId}`;
}

function readCache(applicationId: number, fingerprint: string) {
  try {
    const raw = localStorage.getItem(cacheKey(applicationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed.version !== 1 || parsed.fingerprint !== fingerprint) return null;
    if (!parsed.calculatedAt || Date.now() - parsed.calculatedAt > CACHE_TTL_MS) return null;
    return parsed.score;
  } catch {
    return null;
  }
}

function writeCache(applicationId: number, fingerprint: string, score: ApplicationFactFitScore) {
  try {
    const value: CacheEntry = { version: 1, fingerprint, calculatedAt: Date.now(), score };
    localStorage.setItem(cacheKey(applicationId), JSON.stringify(value));
  } catch {}
}

function clearCache(applicationId: number) {
  try { localStorage.removeItem(cacheKey(applicationId)); } catch {}
}

function scoreTone(score: number) {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function metric(label: string, value: number, inverse = false) {
  const item = document.createElement("div");
  item.className = "fact-fit-metric";
  const name = document.createElement("span");
  name.textContent = label;
  const strong = document.createElement("strong");
  strong.textContent = `${value}`;
  if (inverse) strong.title = "数值越低越好";
  item.append(name, strong);
  return item;
}

function tag(label: string, value: number) {
  const span = document.createElement("span");
  span.textContent = `${label} ${value}`;
  return span;
}

function labeledLine(label: string, values: string[]) {
  const line = document.createElement("p");
  const bold = document.createElement("b");
  bold.textContent = label;
  line.append(bold, document.createTextNode(values.join(" · ")));
  return line;
}

function renderScore(panel: HTMLElement, applicationId: number, score: ApplicationFactFitScore, refresh: () => void) {
  panel.replaceChildren();
  panel.dataset.factFitState = "ready";
  panel.className = `fact-fit-panel fact-fit-${scoreTone(score.score)}`;

  const head = document.createElement("div");
  head.className = "fact-fit-head";
  const title = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.className = "fact-fit-eyebrow";
  eyebrow.textContent = "FACT MASTER MATCH";
  const heading = document.createElement("strong");
  heading.textContent = `事实库匹配 ${score.score} · ${score.label}`;
  title.append(eyebrow, heading);
  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.textContent = "重新评分";
  refreshButton.addEventListener("click", () => {
    clearCache(applicationId);
    refresh();
  });
  head.append(title, refreshButton);

  const metrics = document.createElement("div");
  metrics.className = "fact-fit-metrics";
  metrics.append(
    metric("事实覆盖", score.evidenceCoverage),
    metric("Direct 覆盖", score.directCoverage),
    metric("可迁移覆盖", score.transferableCoverage),
    metric("当前 CV 覆盖", score.cvCoverage),
    metric("Gap 风险", score.gapRisk, true),
  );

  const details = document.createElement("details");
  details.className = "fact-fit-details";
  const summary = document.createElement("summary");
  summary.textContent = "查看细分匹配";
  const counts = document.createElement("div");
  counts.className = "fact-fit-tags";
  counts.append(
    tag("Direct", score.counts.direct),
    tag("Transferable", score.counts.transferable),
    tag("Coursework", score.counts.coursework),
    tag("Adjacent", score.counts.adjacent),
    tag("Unsupported", score.counts.unsupported),
  );
  details.append(summary, counts);

  if (score.topMatches.length) details.append(labeledLine("最强命中：", score.topMatches));
  if (score.gaps.length) details.append(labeledLine("主要缺口：", score.gaps));

  const note = document.createElement("p");
  note.className = "fact-fit-note";
  note.textContent = "基于完整 JD 与 CV 私有事实库 / capability ontology 的初步匹配；Direct、Transferable、Adjacent 边界沿用定制 CV 分析规则。";
  details.append(note);

  panel.append(head, metrics, details);
}

function renderPending(panel: HTMLElement) {
  panel.className = "fact-fit-panel fact-fit-loading";
  panel.dataset.factFitState = "loading";
  panel.innerHTML = '<div class="fact-fit-head"><div><span class="fact-fit-eyebrow">FACT MASTER MATCH</span><strong>正在匹配事实库…</strong></div></div><p class="fact-fit-note">首次评分会读取完整 JD 和私有 CV 事实索引；结果会缓存 24 小时。</p>';
}

function renderMissingJd(panel: HTMLElement, applicationId: number) {
  panel.className = "fact-fit-panel fact-fit-low";
  panel.dataset.factFitState = "missing-jd";
  panel.innerHTML = `<div class="fact-fit-head"><div><span class="fact-fit-eyebrow">FACT MASTER MATCH</span><strong>待补完整 JD</strong></div><a href="/cv-tailor?applicationId=${applicationId}">补 JD ↗</a></div><p class="fact-fit-note">没有完整 JD 时不生成匹配分，避免用职位名称猜测。</p>`;
}

function renderError(panel: HTMLElement, message: string, retry: () => void) {
  panel.className = "fact-fit-panel fact-fit-low";
  panel.dataset.factFitState = "error";
  panel.replaceChildren();
  const head = document.createElement("div");
  head.className = "fact-fit-head";
  const title = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.className = "fact-fit-eyebrow";
  eyebrow.textContent = "FACT MASTER MATCH";
  const strong = document.createElement("strong");
  strong.textContent = "评分暂时失败";
  title.append(eyebrow, strong);
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "重试";
  button.addEventListener("click", retry);
  head.append(title, button);
  const note = document.createElement("p");
  note.className = "fact-fit-note";
  note.textContent = message;
  panel.append(head, note);
}

function hideLegacyFit(card: HTMLElement) {
  const rows = Array.from(card.querySelectorAll<HTMLElement>(".application-details > span"));
  const legacy = rows.find((row) => normalized(row.querySelector("b")?.textContent || "") === "匹配度");
  if (legacy) legacy.style.setProperty("display", "none", "important");
}

function installStyles() {
  if (document.getElementById("ivy-fact-fit-style")) return;
  const style = document.createElement("style");
  style.id = "ivy-fact-fit-style";
  style.textContent = `
    .fact-fit-panel{margin:16px 0 4px;padding:16px;border:1px solid #d8dfda;border-radius:16px;background:#f8faf8;color:#23312a}
    .fact-fit-high{border-color:#b9d9c8;background:#f2f8f4}.fact-fit-medium{border-color:#d9d3b8;background:#fbfaf3}.fact-fit-low{border-color:#e3c8c2;background:#fdf7f5}
    .fact-fit-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.fact-fit-head>div{display:grid;gap:3px}.fact-fit-eyebrow{font-size:10px;letter-spacing:.12em;font-weight:850;color:#617269}.fact-fit-head strong{font-size:17px;color:#155e46}
    .fact-fit-head button,.fact-fit-head a{border:0;background:transparent;color:#53635a;font:700 12px/1.2 inherit;text-decoration:none;cursor:pointer;padding:2px 0}
    .fact-fit-metrics{display:grid;grid-template-columns:repeat(5,minmax(80px,1fr));gap:8px;margin-top:13px}.fact-fit-metric{display:grid;gap:3px;padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.76)}.fact-fit-metric span{font-size:11px;color:#6b776f}.fact-fit-metric strong{font-size:17px}
    .fact-fit-details{margin-top:12px}.fact-fit-details summary{cursor:pointer;font-size:12px;font-weight:800;color:#526159}.fact-fit-tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.fact-fit-tags span{border-radius:999px;background:#eef2ef;padding:5px 8px;font-size:11px}.fact-fit-details p{font-size:12px;line-height:1.6;color:#5c6961;margin:7px 0}.fact-fit-note{font-size:11px!important;line-height:1.55!important;color:#6b776f!important;margin:8px 0 0!important}
    @media(max-width:760px){.fact-fit-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.fact-fit-metric:last-child{grid-column:1/-1}}
  `;
  document.head.append(style);
}

export default function PendingApplicationFitScores() {
  useEffect(() => {
    let disposed = false;
    let active = 0;
    const queue: Array<() => Promise<void>> = [];
    const running = new Set<number>();

    const pump = () => {
      if (disposed) return;
      while (active < MAX_CONCURRENT && queue.length) {
        const task = queue.shift();
        if (!task) break;
        active += 1;
        void task().finally(() => {
          active -= 1;
          pump();
        });
      }
    };

    const scoreApplication = async (applicationId: number, panel: HTMLElement, force = false) => {
      if (running.has(applicationId) && !force) return;
      running.add(applicationId);
      renderPending(panel);
      try {
        const applicationResponse = await fetch(`/api/cv-tailor/application?applicationId=${applicationId}`, { cache: "no-store" });
        const application = await applicationResponse.json() as ApplicationPrefill & { error?: string };
        if (!applicationResponse.ok) throw new Error(application.error || "无法读取申请信息。");
        const jd = String(application.jd || "").trim();
        if (!jd) {
          renderMissingJd(panel, applicationId);
          return;
        }

        const fingerprint = hashText([
          application.track,
          application.language,
          application.resumeVersion || "",
          jd,
        ].join("\u0000"));
        if (!force) {
          const cached = readCache(applicationId, fingerprint);
          if (cached) {
            renderScore(panel, applicationId, cached, () => void scoreApplication(applicationId, panel, true));
            return;
          }
        }

        const analysisResponse = await fetch("/api/cv-tailor/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ track: application.track, language: application.language, jd }),
        });
        const analysis = await analysisResponse.json() as AnalysisResponse;
        if (!analysisResponse.ok) throw new Error(analysis.error || "事实库匹配失败。");
        const score = calculateApplicationFactFit(Array.isArray(analysis.matches) ? analysis.matches : []);
        writeCache(applicationId, fingerprint, score);
        renderScore(panel, applicationId, score, () => void scoreApplication(applicationId, panel, true));
      } catch (error) {
        renderError(panel, error instanceof Error ? error.message : "事实库匹配失败。", () => void scoreApplication(applicationId, panel, true));
      } finally {
        running.delete(applicationId);
      }
    };

    const enqueue = (applicationId: number, panel: HTMLElement) => {
      if (panel.dataset.factFitQueued === "true") return;
      panel.dataset.factFitQueued = "true";
      queue.push(() => scoreApplication(applicationId, panel));
      pump();
    };

    const enhance = () => {
      if (disposed || !pendingTabIsActive()) return;
      installStyles();
      const cards = Array.from(document.querySelectorAll<HTMLElement>("section.application-list article.application-card"));
      for (const card of cards) {
        const applicationId = applicationIdFromCard(card);
        if (!applicationId) continue;
        hideLegacyFit(card);
        let panel = card.querySelector<HTMLElement>(`:scope > [data-fact-fit-application="${applicationId}"]`);
        if (!panel) {
          panel = document.createElement("section");
          panel.dataset.factFitApplication = String(applicationId);
          const note = card.querySelector<HTMLElement>(":scope > .record-note");
          if (note) card.insertBefore(panel, note);
          else card.append(panel);
        }
        enqueue(applicationId, panel);
      }
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "href"] });
    const focus = () => enhance();
    window.addEventListener("focus", focus);

    return () => {
      disposed = true;
      queue.length = 0;
      observer.disconnect();
      window.removeEventListener("focus", focus);
    };
  }, []);

  return null;
}
