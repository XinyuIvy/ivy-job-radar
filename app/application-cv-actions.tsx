"use client";

import { useEffect } from "react";

function normalized(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function candidateViewActive() {
  const heroTitle = Array.from(document.querySelectorAll<HTMLElement>(".hero h1"))
    .find((element) => element.offsetParent !== null);
  return normalized(heroTitle?.textContent || "") === "候选岗位";
}

function buttonText(element: Element) {
  return normalized(element.textContent || "");
}

export default function ApplicationCvActions() {
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | null = null;
    let activeTaskButton: HTMLButtonElement | null = null;
    let enhanceTimer = 0;

    const enhance = () => {
      if (disposed || !candidateViewActive()) return;
      const cards = Array.from(document.querySelectorAll<HTMLElement>("article.application-card[data-application-row-id]"));
      for (const card of cards) {
        const applicationId = Number(card.dataset.applicationRowId || 0);
        if (!Number.isInteger(applicationId) || applicationId <= 0) continue;
        const editButton = Array.from(card.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => buttonText(button) === "编辑记录");
        if (!editButton) continue;

        const actionContainer = editButton.parentElement ?? card;
        if (!actionContainer.querySelector('[data-cv-tailor-action="true"]')) {
          const link = document.createElement("a");
          link.dataset.cvTailorAction = "true";
          link.href = `/cv-tailor?applicationId=${applicationId}`;
          link.textContent = "定制 CV";
          link.style.borderRadius = "10px";
          link.style.padding = "9px 14px";
          link.style.background = "#704c2f";
          link.style.color = "#fff";
          link.style.fontWeight = "800";
          link.style.textDecoration = "none";
          link.style.fontSize = "13px";
          actionContainer.insertBefore(link, editButton);
        }

        const taskButton = Array.from(card.querySelectorAll<HTMLButtonElement>("button"))
          .find((button) => buttonText(button) === "新增任务");
        if (taskButton) {
          taskButton.style.setProperty("display", "none", "important");
          taskButton.setAttribute("aria-hidden", "true");
          if (editButton.dataset.taskMergeBound !== "true") {
            editButton.dataset.taskMergeBound = "true";
            editButton.addEventListener("click", () => {
              activeTaskButton = taskButton;
              window.setTimeout(scheduleEnhance, 0);
            });
          }
        }
      }

      const modal = document.querySelector<HTMLElement>(".modal-backdrop .application-form, .modal-backdrop [role=dialog], .modal-backdrop form");
      if (modal && activeTaskButton && !modal.querySelector('[data-task-proxy="true"]')) {
        const proxy = document.createElement("button");
        proxy.type = "button";
        proxy.dataset.taskProxy = "true";
        proxy.textContent = "＋ 新增申请任务";
        proxy.style.borderRadius = "999px";
        proxy.style.padding = "9px 14px";
        proxy.style.border = "1px solid #c9c4b5";
        proxy.style.background = "#fff";
        proxy.style.fontWeight = "800";
        proxy.addEventListener("click", () => activeTaskButton?.click());
        modal.append(proxy);
      }
    };

    function scheduleEnhance() {
      window.clearTimeout(enhanceTimer);
      enhanceTimer = window.setTimeout(enhance, 60);
    }

    scheduleEnhance();
    observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", scheduleEnhance);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("focus", scheduleEnhance);
      window.clearTimeout(enhanceTimer);
    };
  }, []);

  return null;
}
