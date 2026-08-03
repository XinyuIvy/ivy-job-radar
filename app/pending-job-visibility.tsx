"use client";

import { useEffect } from "react";

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

export default function PendingJobVisibility() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    let intervalId: number | undefined;
    let pendingKeys = new Set<string>();
    let modalWasOpen = Boolean(document.querySelector(".modal-backdrop"));

    const refreshPendingKeys = async () => {
      const response = await fetch("/api/applications", { cache: "no-store" });
      if (!response.ok || disposed) return;
      const rows = await response.json() as ApplicationRow[];
      pendingKeys = new Set(
        rows
          .filter((row) => row.status === "准备材料")
          .map((row) => `${normalize(row.company)}::${normalize(row.title)}`),
      );
    };

    const applyVisibility = () => {
      if (disposed) return;
      const onTodayView = Array.from(document.querySelectorAll("h2"))
        .some((node) => node.textContent?.trim().startsWith("今日岗位"));
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".job-list .job-card"));

      for (const card of cards) {
        if (!onTodayView) {
          card.style.removeProperty("display");
          card.removeAttribute("aria-hidden");
          continue;
        }
        const title = card.querySelector(".job-title h3")?.textContent ?? "";
        const companyLine = card.querySelector(".job-title p")?.textContent ?? "";
        const company = companyLine.split("·")[0]?.trim() ?? "";
        const shouldHide = pendingKeys.has(`${normalize(company)}::${normalize(title)}`);
        if (shouldHide) {
          card.style.setProperty("display", "none", "important");
          card.setAttribute("aria-hidden", "true");
        } else {
          card.style.removeProperty("display");
          card.removeAttribute("aria-hidden");
        }
      }
    };

    const run = async () => {
      await refreshPendingKeys();
      applyVisibility();
    };

    void run();
    observer = new MutationObserver(() => {
      const modalIsOpen = Boolean(document.querySelector(".modal-backdrop"));
      if (modalWasOpen && !modalIsOpen) {
        void run();
      } else {
        applyVisibility();
      }
      modalWasOpen = modalIsOpen;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const onFocus = () => void run();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void run();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    intervalId = window.setInterval(() => void run(), 5000);

    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
