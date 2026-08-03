"use client";

import { useEffect } from "react";

type RequestItem = {
  id: number;
  company: string;
  title: string;
  status: string;
  jobUrl: string;
};

type ApplicationRow = {
  company: string;
  title: string;
  status: string;
};

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function key(company: string, title: string) {
  return `${normalize(company)}::${normalize(title)}`;
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
  element.style.background = tone === "approve"
    ? "#16794b"
    : tone === "danger"
      ? "#a33f35"
      : tone === "neutral"
        ? "#e8e4d9"
        : "transparent";
  element.style.color = tone === "approve" || tone === "danger" ? "#fff" : tone === "quiet" ? "#7c4c47" : "#26342d";
  return element;
}

export default function VerificationQueueActions() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    let scheduled = false;

    const enhance = async () => {
      scheduled = false;
      if (disposed) return;

      const [requestResponse, applicationResponse] = await Promise.all([
        fetch("/api/job-requests", { cache: "no-store" }),
        fetch("/api/applications", { cache: "no-store" }),
      ]);
      if (!requestResponse.ok || disposed) return;

      const items = await requestResponse.json() as RequestItem[];
      const applications = applicationResponse.ok
        ? await applicationResponse.json() as ApplicationRow[]
        : [];
      const pendingKeys = new Set(
        applications
          .filter((row) => row.status === "准备材料")
          .map((row) => key(row.company, row.title)),
      );
      const itemByKey = new Map(items.map((item) => [key(item.company, item.title), item]));
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".request-list .request-card"));

      for (const card of cards) {
        const title = card.querySelector("h3")?.textContent?.trim() ?? "";
        const company = card.querySelector("h3 + p")?.textContent?.trim()
          ?? card.querySelector("div > p")?.textContent?.trim()
          ?? "";
        const cardKey = key(company, title);
        const item = itemByKey.get(cardKey);
        if (!item) continue;

        if (pendingKeys.has(cardKey)) {
          card.style.setProperty("display", "none", "important");
          card.setAttribute("aria-hidden", "true");
          continue;
        }
        card.style.removeProperty("display");
        card.removeAttribute("aria-hidden");

        const status = card.querySelector(".verify-status")?.textContent?.trim() || item.status;
        if (status !== "需复核") continue;
        const actions = card.querySelector<HTMLElement>(".record-actions");
        if (!actions || actions.dataset.manualReviewEnhanced === "true") continue;

        actions.dataset.manualReviewEnhanced = "true";
        actions.querySelectorAll("button").forEach((existing) => existing.remove());

        const run = async (action: "approve" | "ignore" | "delete" | "rerun", trigger: HTMLButtonElement) => {
          const prompts = {
            approve: `确认人工通过 ${item.company} · ${item.title}，并直接加入今日岗位吗？`,
            ignore: `确认将 ${item.company} · ${item.title} 加入不再推荐，并从核验队列删除吗？`,
            delete: "确认仅删除这条核验记录吗？该岗位未来仍可能再次出现。",
            rerun: `确认重新核验 ${item.company} · ${item.title} 吗？`,
          };
          if (!window.confirm(prompts[action])) return;
          const original = trigger.textContent;
          trigger.disabled = true;
          trigger.textContent = action === "rerun" ? "核验中…" : "处理中…";
          const result = action === "rerun"
            ? await fetch("/api/job-requests", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: item.id }),
              })
            : await fetch("/api/manual-review", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: item.id, action }),
              });
          if (!result.ok) {
            trigger.disabled = false;
            trigger.textContent = original;
            window.alert("操作失败，请稍后重试。");
            return;
          }
          window.location.reload();
        };

        const approve = button("人工通过", "approve");
        approve.addEventListener("click", () => void run("approve", approve));
        const rerun = button("重新核验", "neutral");
        rerun.addEventListener("click", () => void run("rerun", rerun));
        const ignore = button("不再推荐", "danger");
        ignore.addEventListener("click", () => void run("ignore", ignore));
        const remove = button("仅删除记录", "quiet");
        remove.addEventListener("click", () => void run("delete", remove));
        actions.append(approve, rerun, ignore, remove);
      }
    };

    const schedule = () => {
      if (scheduled || disposed) return;
      scheduled = true;
      window.setTimeout(() => void enhance(), 0);
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
