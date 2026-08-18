"use client";

import { useEffect } from "react";

import { sameLogicalJob, type JobIdentityInput } from "./lib/job-identity";

type ApplicationRow = JobIdentityInput & {
  status: string;
};

function cardIdentity(card: HTMLElement): JobIdentityInput {
  const title = card.querySelector(".job-title h3")?.textContent?.trim() ?? "";
  const companyLine = card.querySelector(".job-title p")?.textContent ?? "";
  const [companyPart, ...locationParts] = companyLine.split("·");
  const jobUrl = card.querySelector<HTMLAnchorElement>("a.job-link")?.href ?? "";

  return {
    company: companyPart?.trim() ?? "",
    title,
    location: locationParts.join("·").trim(),
    jobUrl,
  };
}

export default function PendingJobVisibility() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    let pendingApplications: ApplicationRow[] = [];
    let modalWasOpen = Boolean(document.querySelector(".modal-backdrop"));

    const refreshPendingApplications = async () => {
      const response = await fetch("/api/applications", { cache: "no-store" });
      if (!response.ok || disposed) return;
      const rows = await response.json() as ApplicationRow[];
      pendingApplications = rows.filter((row) => row.status === "准备材料");
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

        const identity = cardIdentity(card);
        const shouldHide = pendingApplications.some((row) => sameLogicalJob(row, identity));
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
      await refreshPendingApplications();
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
    const intervalId = window.setInterval(() => void run(), 5000);

    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
