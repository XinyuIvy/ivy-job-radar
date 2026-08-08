"use client";

import { useEffect } from "react";

const APPROVAL_KEY = "ivy-job-radar:last-approved-job";

type ApprovedJob = {
  company?: string;
  title?: string;
  jobUrl?: string;
  sentAt?: number;
};

function text(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isTodayView() {
  const hero = document.querySelector<HTMLElement>(".hero h1");
  return text(hero?.textContent).startsWith("早上好");
}

function applySavedVisibility() {
  const today = isTodayView();
  document.querySelectorAll<HTMLElement>(".job-list .job-card").forEach((card) => {
    const save = card.querySelector<HTMLButtonElement>(".save-button");
    const optimisticallyMoving = card.dataset.optimisticSaved === "true";
    const saved = Boolean(save?.classList.contains("saved"));
    if (today && (saved || optimisticallyMoving)) {
      card.style.setProperty("display", "none", "important");
      card.setAttribute("aria-hidden", "true");
    } else if (card.dataset.optimisticSaved === "true" && !saved) {
      delete card.dataset.optimisticSaved;
      card.style.removeProperty("display");
      card.removeAttribute("aria-hidden");
    }
  });
}

function optimisticSaveClick(event: MouseEvent) {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>(".job-card .save-button");
  if (!button || !isTodayView() || button.classList.contains("saved")) return;
  const card = button.closest<HTMLElement>(".job-card");
  if (!card) return;
  card.dataset.optimisticSaved = "true";
  card.style.transition = "opacity .12s ease, transform .12s ease";
  card.style.opacity = "0";
  card.style.transform = "translateY(-6px)";
  window.setTimeout(() => {
    if (card.dataset.optimisticSaved === "true") {
      card.style.setProperty("display", "none", "important");
      card.setAttribute("aria-hidden", "true");
    }
  }, 110);
}

function findJobCard(company: string, title: string) {
  const companyKey = text(company).toLowerCase();
  const titleKey = text(title).toLowerCase();
  return Array.from(document.querySelectorAll<HTMLElement>(".job-card")).find((card) => {
    const cardText = text(card.textContent).toLowerCase();
    return Boolean(companyKey && titleKey && cardText.includes(companyKey) && cardText.includes(titleKey));
  }) ?? null;
}

function optimisticIgnoreClick(event: MouseEvent) {
  const option = (event.target as Element | null)?.closest<HTMLButtonElement>(".ignore-dialog .ignore-options button");
  if (!option || option.dataset.ignoreReason === "hard-requirement") return;
  const dialog = option.closest<HTMLElement>(".ignore-dialog");
  if (!dialog) return;
  const title = text(dialog.querySelector("#ignore-title")?.textContent);
  const description = text(dialog.querySelector(":scope > p")?.textContent);
  const company = description.split("·")[0]?.trim() || "";
  const card = findJobCard(company, title);
  if (!card) return;
  card.dataset.optimisticIgnored = "true";
  card.style.setProperty("display", "none", "important");
  card.setAttribute("aria-hidden", "true");

  window.setTimeout(async () => {
    const response = await fetch("/api/ignored-jobs", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const rows = await response.json().catch(() => []) as Array<{ company?: string; title?: string }>;
    const persisted = rows.some((row) => text(row.company).toLowerCase() === company.toLowerCase() && text(row.title).toLowerCase() === title.toLowerCase());
    if (!persisted && card.isConnected) {
      delete card.dataset.optimisticIgnored;
      card.style.removeProperty("display");
      card.removeAttribute("aria-hidden");
      card.style.opacity = "";
      card.style.transform = "";
    }
  }, 1200);
}

function approvedKey(job: ApprovedJob) {
  return `${text(job.company).toLowerCase()}::${text(job.title).toLowerCase()}`;
}

function makeApprovedPlaceholder(job: ApprovedJob) {
  const card = document.createElement("article");
  card.className = "job-card";
  card.dataset.approvedPlaceholder = approvedKey(job);

  const top = document.createElement("div");
  top.className = "job-card-top";
  const logo = document.createElement("div");
  logo.className = "company-logo";
  logo.textContent = text(job.company).slice(0, 2) || "✓";
  const titleBlock = document.createElement("div");
  titleBlock.className = "job-title";
  const meta = document.createElement("div");
  meta.className = "job-meta";
  const now = document.createElement("span");
  now.textContent = "刚刚人工通过";
  meta.append(now);
  const heading = document.createElement("h3");
  heading.textContent = text(job.title) || "已通过岗位";
  const company = document.createElement("p");
  company.textContent = text(job.company);
  titleBlock.append(meta, heading, company);
  top.append(logo, titleBlock);

  const row = document.createElement("div");
  row.className = "match-row";
  const score = document.createElement("div");
  score.className = "score";
  score.innerHTML = "<strong>✓</strong><span>人工通过</span>";
  const evidence = document.createElement("div");
  evidence.className = "evidence";
  const strong = document.createElement("strong");
  strong.textContent = "岗位已通过核验，详细信息正在后台同步。";
  const note = document.createElement("p");
  note.textContent = "公司和岗位名称已先显示，不需要等待整页刷新。";
  evidence.append(strong, note);
  row.append(score, evidence);

  const actions = document.createElement("div");
  actions.className = "card-actions";
  if (job.jobUrl) {
    const link = document.createElement("a");
    link.className = "secondary job-link";
    link.href = job.jobUrl;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.textContent = "打开 JD ↗";
    actions.append(link);
  }
  card.append(top, row, actions);
  return card;
}

function showApprovedPlaceholder(job: ApprovedJob) {
  if (!isTodayView() || !job.company || !job.title) return;
  const list = document.querySelector<HTMLElement>(".job-list:not(.saved-job-list)");
  if (!list) return;
  if (findJobCard(job.company, job.title)) return;
  const key = approvedKey(job);
  if (list.querySelector(`[data-approved-placeholder="${CSS.escape(key)}"]`)) return;
  const empty = list.querySelector<HTMLElement>(":scope > .empty-state");
  empty?.remove();
  list.prepend(makeApprovedPlaceholder(job));
}

function readLastApproval() {
  try {
    const raw = localStorage.getItem(APPROVAL_KEY);
    if (!raw) return null;
    const job = JSON.parse(raw) as ApprovedJob;
    if (!job.sentAt || Date.now() - job.sentAt > 10 * 60 * 1000) return null;
    return job;
  } catch {
    return null;
  }
}

export default function OptimisticDashboardActions() {
  useEffect(() => {
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        applySavedVisibility();
        const approval = readLastApproval();
        if (approval) showApprovedPlaceholder(approval);
      });
    };

    const approvedHandler = (event: Event) => {
      const job = (event as CustomEvent<ApprovedJob>).detail;
      showApprovedPlaceholder(job);
    };
    const storageHandler = (event: StorageEvent) => {
      if (event.key !== APPROVAL_KEY || !event.newValue) return;
      try { showApprovedPlaceholder(JSON.parse(event.newValue) as ApprovedJob); } catch {}
    };

    document.addEventListener("click", optimisticSaveClick, true);
    document.addEventListener("click", optimisticIgnoreClick, true);
    window.addEventListener("ivy-job-radar-approved", approvedHandler);
    window.addEventListener("storage", storageHandler);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    schedule();

    return () => {
      document.removeEventListener("click", optimisticSaveClick, true);
      document.removeEventListener("click", optimisticIgnoreClick, true);
      window.removeEventListener("ivy-job-radar-approved", approvedHandler);
      window.removeEventListener("storage", storageHandler);
      observer.disconnect();
    };
  }, []);
  return null;
}
