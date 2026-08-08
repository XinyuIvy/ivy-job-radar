"use client";

import { useEffect } from "react";

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

export default function OptimisticDashboardActions() {
  useEffect(() => {
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        applySavedVisibility();
      });
    };

    document.addEventListener("click", optimisticSaveClick, true);
    document.addEventListener("click", optimisticIgnoreClick, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    schedule();

    return () => {
      document.removeEventListener("click", optimisticSaveClick, true);
      document.removeEventListener("click", optimisticIgnoreClick, true);
      observer.disconnect();
    };
  }, []);
  return null;
}
