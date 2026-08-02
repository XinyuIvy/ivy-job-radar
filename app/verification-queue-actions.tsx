"use client";

import { useEffect } from "react";

type RequestItem = {
  id: number;
  company: string;
  title: string;
  status: string;
  jobUrl: string;
};

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

    const enhance = async () => {
      if (disposed) return;
      const response = await fetch("/api/job-requests", { cache: "no-store" });
      if (!response.ok || disposed) return;
      const items = await response.json() as RequestItem[];
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".request-list .request-card"));

      items.forEach((item, index) => {
        const card = cards[index];
        if (!card || card.dataset.manualReviewEnhanced === "true") return;
        const status = card.querySelector(".verify-status")?.textContent?.trim() || item.status;
        if (status !== "需复核") return;
        const actions = card.querySelector<HTMLElement>(".record-actions");
        if (!actions) return;

        card.dataset.manualReviewEnhanced = "true";
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
      });
    };

    const schedule = () => window.setTimeout(() => void enhance(), 0);
    schedule();
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, []);

  return null;
}
