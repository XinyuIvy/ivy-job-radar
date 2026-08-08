"use client";

import { useEffect } from "react";

type PendingApplication = {
  id?: number;
  company?: string;
  title?: string;
  location?: string;
  region?: string;
  jobUrl?: string;
  priority?: string;
  status?: string;
  source?: string;
  updatedAt?: string;
};

type PendingMessage = {
  type?: string;
  application?: PendingApplication;
  sentAt?: number;
};

const CHANNEL_NAME = "ivy-job-radar-updates";
const STORAGE_KEY = "ivy-job-radar:last-pending-created";

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function itemKey(application: PendingApplication) {
  return `${normalized(application.company || "").toLowerCase()}::${normalized(application.title || "").toLowerCase()}`;
}

function pendingTabIsActive() {
  const heroTitle = Array.from(document.querySelectorAll<HTMLElement>(".hero h1"))
    .find((element) => element.offsetParent !== null);
  if (normalized(heroTitle?.textContent || "") !== "收藏与待提交") return false;

  return Array.from(document.querySelectorAll<HTMLButtonElement>(".stats-two button.active"))
    .some((button) => normalized(button.textContent || "").startsWith("待提交申请"));
}

function findPendingList() {
  if (!pendingTabIsActive()) return null;
  return Array.from(document.querySelectorAll<HTMLElement>("section.application-list"))
    .find((section) => section.offsetParent !== null) ?? null;
}

function makeCard(application: PendingApplication) {
  const article = document.createElement("article");
  article.className = "application-card";
  article.dataset.livePendingApplication = String(application.id || itemKey(application));
  article.dataset.livePendingKey = itemKey(application);
  article.style.animation = "ivyPendingAppear .25s ease-out";

  const head = document.createElement("div");
  head.className = "application-head";
  const identity = document.createElement("div");
  const status = document.createElement("span");
  status.className = "status status-准备材料";
  status.textContent = "准备材料";
  const title = document.createElement("h3");
  title.textContent = application.title || "待补充职位名称";
  const company = document.createElement("p");
  company.textContent = [application.company, application.location || application.region].filter(Boolean).join(" · ");
  identity.append(status, title, company);
  const priority = document.createElement("span");
  priority.className = "priority";
  priority.textContent = application.priority || "P1";
  head.append(identity, priority);

  const details = document.createElement("div");
  details.className = "application-details";
  const detailRows = [
    ["匹配度", "5/5"],
    ["状态", "待提交申请"],
    ["Application ID", "未填写"],
    ["下一步", "准备申请材料"],
    ["计划申请", "未设置"],
    ["申请截止", "JD 未公布"],
  ];
  for (const [label, value] of detailRows) {
    const span = document.createElement("span");
    const bold = document.createElement("b");
    bold.textContent = label;
    span.append(bold, document.createTextNode(value));
    details.append(span);
  }

  const note = document.createElement("p");
  note.className = "record-note";
  note.textContent = "刚刚通过 Chrome 手动保存，已直接加入待提交申请。";

  const actions = document.createElement("div");
  actions.className = "record-actions";
  if (application.jobUrl) {
    const jd = document.createElement("a");
    jd.href = application.jobUrl;
    jd.target = "_blank";
    jd.rel = "noreferrer noopener";
    jd.textContent = "打开 JD ↗";
    actions.append(jd);
  }
  if (application.id) {
    const cv = document.createElement("a");
    cv.href = `/cv-tailor?applicationId=${application.id}`;
    cv.dataset.cvTailorAction = "true";
    cv.textContent = "定制 CV";
    actions.append(cv);
  }

  article.append(head, details, note, actions);
  return article;
}

function cardAlreadyPresent(list: HTMLElement, application: PendingApplication) {
  const key = itemKey(application);
  if (list.querySelector(`[data-live-pending-key="${CSS.escape(key)}"]`)) return true;
  const company = normalized(application.company || "").toLowerCase();
  const title = normalized(application.title || "").toLowerCase();
  return Array.from(list.querySelectorAll<HTMLElement>("article.application-card")).some((article) => {
    const text = normalized(article.textContent || "").toLowerCase();
    return Boolean(company && title && text.includes(company) && text.includes(title));
  });
}

function insertPending(application: PendingApplication) {
  const list = findPendingList();
  if (!list || cardAlreadyPresent(list, application)) return false;

  const emptyState = list.querySelector<HTMLElement>(":scope > .empty-state");
  emptyState?.remove();
  list.prepend(makeCard(application));

  if (!document.getElementById("ivy-pending-live-style")) {
    const style = document.createElement("style");
    style.id = "ivy-pending-live-style";
    style.textContent = "@keyframes ivyPendingAppear{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}";
    document.head.append(style);
  }
  return true;
}

async function reconcilePendingFromServer() {
  const list = findPendingList();
  if (!list) return;
  const response = await fetch("/api/applications", { cache: "no-store" });
  if (!response.ok) return;
  const rows = await response.json().catch(() => []) as PendingApplication[];
  const pending = rows.filter((row) => row.status === "准备材料");
  for (const application of [...pending].reverse()) insertPending(application);
}

export default function PendingApplicationLiveSync() {
  useEffect(() => {
    let disposed = false;
    let syncTimer = 0;
    let wasPendingActive = false;

    const scheduleReconcile = (delay = 80) => {
      window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(() => {
        if (!disposed) void reconcilePendingFromServer();
      }, delay);
    };

    const handle = (message: PendingMessage) => {
      if (message.type !== "ivy-job-radar-pending-created" || !message.application) return;
      insertPending(message.application);
      scheduleReconcile(120);
    };

    const windowHandler = (event: MessageEvent<PendingMessage>) => {
      if (event.origin !== window.location.origin) return;
      handle(event.data);
    };
    window.addEventListener("message", windowHandler);

    const storageHandler = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try { handle(JSON.parse(event.newValue) as PendingMessage); } catch {}
    };
    window.addEventListener("storage", storageHandler);

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    if (channel) channel.onmessage = (event: MessageEvent<PendingMessage>) => handle(event.data);

    const observer = new MutationObserver(() => {
      const active = pendingTabIsActive();
      if (active && !wasPendingActive) scheduleReconcile(40);
      wasPendingActive = active;
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    const focusHandler = () => scheduleReconcile(40);
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") scheduleReconcile(40);
    };
    window.addEventListener("focus", focusHandler);
    document.addEventListener("visibilitychange", visibilityHandler);

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) handle(JSON.parse(saved) as PendingMessage);
    } catch {}
    scheduleReconcile(120);

    return () => {
      disposed = true;
      window.clearTimeout(syncTimer);
      window.removeEventListener("message", windowHandler);
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener("focus", focusHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      observer.disconnect();
      channel?.close();
    };
  }, []);
  return null;
}
