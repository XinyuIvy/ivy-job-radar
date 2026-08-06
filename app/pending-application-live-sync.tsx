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
};

type PendingMessage = {
  type?: string;
  application?: PendingApplication;
};

const CHANNEL_NAME = "ivy-job-radar-updates";

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isPendingViewVisible() {
  const selectedNav = document.querySelector<HTMLButtonElement>(".bottom-nav button.selected");
  if (!selectedNav || !normalized(selectedNav.textContent || "").includes("收藏")) return false;
  return Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,button,span"))
    .some((element) => normalized(element.textContent || "") === "待提交申请" && element.offsetParent !== null);
}

function findPendingList() {
  const label = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,button,span"))
    .find((element) => normalized(element.textContent || "") === "待提交申请" && element.offsetParent !== null);
  if (!label) return null;

  const section = label.closest<HTMLElement>("section") || label.closest<HTMLElement>("div");
  if (!section) return null;
  return section.querySelector<HTMLElement>(".application-list, .record-list, .saved-list, [data-application-list]")
    || Array.from(section.querySelectorAll<HTMLElement>("div"))
      .find((candidate) => candidate.querySelector("article"))
    || section;
}

function makeCard(application: PendingApplication) {
  const article = document.createElement("article");
  article.dataset.livePendingApplication = String(application.id || `${application.company}-${application.title}`);
  article.style.cssText = "background:#fffdf8;border:1px solid #d9d5ca;border-radius:18px;padding:18px;margin-bottom:12px;box-shadow:0 10px 28px rgba(55,63,57,.06);animation:ivyPendingAppear .25s ease-out";

  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;gap:16px;align-items:flex-start";
  const text = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = application.title || "待补充职位名称";
  title.style.cssText = "margin:0 0 6px;font-size:18px";
  const company = document.createElement("p");
  company.textContent = [application.company, application.location || application.region].filter(Boolean).join(" · ");
  company.style.cssText = "margin:0;color:#5f6c64";
  text.append(title, company);

  const badge = document.createElement("span");
  badge.textContent = "刚刚保存";
  badge.style.cssText = "white-space:nowrap;border-radius:999px;padding:6px 10px;background:#e6f3eb;color:#16794b;font-size:12px;font-weight:800";
  header.append(text, badge);

  const details = document.createElement("p");
  details.textContent = `${application.priority || "P1"} · 准备材料 · ${application.source || "Chrome 手动保存"}`;
  details.style.cssText = "margin:14px 0 0;color:#66736c;font-size:13px";

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin-top:14px";
  if (application.jobUrl) {
    const jd = document.createElement("a");
    jd.href = application.jobUrl;
    jd.target = "_blank";
    jd.rel = "noreferrer noopener";
    jd.textContent = "打开 JD ↗";
    jd.style.cssText = "border-radius:999px;padding:9px 13px;background:#18221d;color:#fff;text-decoration:none;font-weight:750;font-size:13px";
    actions.append(jd);
  }
  if (application.id) {
    const cv = document.createElement("a");
    cv.href = `/cv-tailor?applicationId=${application.id}`;
    cv.textContent = "定制 CV";
    cv.style.cssText = "border-radius:999px;padding:9px 13px;background:#16794b;color:#fff;text-decoration:none;font-weight:750;font-size:13px";
    actions.append(cv);
  }

  article.append(header, details, actions);
  return article;
}

function insertPending(application: PendingApplication) {
  if (!isPendingViewVisible()) return;
  const list = findPendingList();
  if (!list) return;

  const identifier = String(application.id || `${application.company}-${application.title}`);
  list.querySelector(`[data-live-pending-application="${CSS.escape(identifier)}"]`)?.remove();
  const card = makeCard(application);
  list.prepend(card);

  if (!document.getElementById("ivy-pending-live-style")) {
    const style = document.createElement("style");
    style.id = "ivy-pending-live-style";
    style.textContent = "@keyframes ivyPendingAppear{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}";
    document.head.append(style);
  }
  window.requestAnimationFrame(() => card.scrollIntoView({ behavior: "smooth", block: "start" }));
}

export default function PendingApplicationLiveSync() {
  useEffect(() => {
    const handle = (message: PendingMessage) => {
      if (message.type !== "ivy-job-radar-pending-created" || !message.application) return;
      insertPending(message.application);
    };

    const windowHandler = (event: MessageEvent<PendingMessage>) => {
      if (event.origin !== window.location.origin) return;
      handle(event.data);
    };
    window.addEventListener("message", windowHandler);

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    if (channel) channel.onmessage = (event: MessageEvent<PendingMessage>) => handle(event.data);

    return () => {
      window.removeEventListener("message", windowHandler);
      channel?.close();
    };
  }, []);
  return null;
}
