"use client";

import { useEffect } from "react";

type ApplicationRow = {
  id: number;
  company: string;
  title: string;
  status: string;
};

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/&/g, "and").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function key(company: string, title: string) {
  return `${normalize(company)}::${normalize(title)}`;
}

function buttonText(element: Element) {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function findApplicationCard(button: HTMLButtonElement) {
  let current: HTMLElement | null = button.parentElement;
  while (current && current !== document.body) {
    if (current.querySelector("h3") && buttonText(current).includes("Application ID")) return current;
    current = current.parentElement;
  }
  return button.closest<HTMLElement>("article, .application-card, .record-card, .job-card, li");
}

export default function ApplicationCvActions() {
  useEffect(() => {
    let disposed = false;
    let applicationsByKey = new Map<string, ApplicationRow>();
    let observer: MutationObserver | null = null;
    let activeTaskButton: HTMLButtonElement | null = null;

    const load = async () => {
      const response = await fetch("/api/applications", { cache: "no-store" });
      if (!response.ok || disposed) return;
      const rows = await response.json() as ApplicationRow[];
      applicationsByKey = new Map(rows.filter((row) => row.status === "准备材料").map((row) => [key(row.company, row.title), row]));
      enhance();
    };

    const enhance = () => {
      if (disposed) return;
      const editButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .filter((button) => {
          const text = buttonText(button);
          return text === "编辑记录" || text.includes("编辑申请状态");
        });

      for (const editButton of editButtons) {
        const card = findApplicationCard(editButton);
        if (!card) continue;
        const title = card.querySelector("h3")?.textContent?.trim() ?? "";
        const companyLine = Array.from(card.querySelectorAll("p"))
          .map((node) => node.textContent?.trim() ?? "")
          .find((text) => text.includes("·")) ?? "";
        const company = companyLine.split("·")[0]?.trim() ?? "";
        const application = applicationsByKey.get(key(company, title));
        if (!application) continue;

        const actionContainer = editButton.parentElement ?? card;
        if (!actionContainer.querySelector('[data-cv-tailor-action="true"]')) {
          const link = document.createElement("a");
          link.dataset.cvTailorAction = "true";
          link.href = `/cv-tailor?applicationId=${application.id}`;
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
          taskButton.dataset.mergedTaskButton = "true";
          if (editButton.dataset.taskMergeBound !== "true") {
            editButton.dataset.taskMergeBound = "true";
            editButton.addEventListener("click", () => {
              activeTaskButton = taskButton;
              window.setTimeout(() => enhance(), 0);
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

    void load();
    observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("focus", load);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("focus", load);
    };
  }, []);

  return null;
}
