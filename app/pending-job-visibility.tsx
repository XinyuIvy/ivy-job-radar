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
    let pendingKeys = new Set<string>();

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
      const heading = Array.from(document.querySelectorAll("h2"))
        .find((node) => node.textContent?.trim().startsWith("今日岗位"));
      const onTodayView = Boolean(heading);
      const cards = Array.from(document.querySelectorAll<HTMLElement>(".job-list .job-card"));
      let visibleCount = 0;

      for (const card of cards) {
        if (!onTodayView) {
          card.hidden = false;
          continue;
        }
        const title = card.querySelector(".job-title h3")?.textContent ?? "";
        const companyLine = card.querySelector(".job-title p")?.textContent ?? "";
        const company = companyLine.split("·")[0]?.trim() ?? "";
        const shouldHide = pendingKeys.has(`${normalize(company)}::${normalize(title)}`);
        card.hidden = shouldHide;
        if (!shouldHide) visibleCount += 1;
      }

      if (heading && /^今日岗位（\d+）$/.test(heading.textContent?.trim() ?? "")) {
        heading.textContent = `今日岗位（${visibleCount}）`;
      }
    };

    const run = async () => {
      await refreshPendingKeys();
      applyVisibility();
    };

    void run();
    observer = new MutationObserver(() => applyVisibility());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
