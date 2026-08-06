"use client";

import { useEffect } from "react";

import { removeCachedJob } from "./job-data-cache";

const hardRequirementReasons = [
  "经验年限或职级不符合",
  "学历或专业要求不符合",
  "工作授权或 sponsorship 不符合",
  "地点或工作方式不符合",
  "必备技能、证书或语言不符合",
  "其他硬性条件不符合",
];

function extractTarget(dialog: HTMLElement) {
  const title = dialog.querySelector("#ignore-title")?.textContent?.trim() || "";
  const description = dialog.querySelector(":scope > p")?.textContent?.trim() || "";
  const company = description.split("·")[0]?.trim() || "";
  return { company, title };
}

function closeDialogImmediately(dialog: HTMLElement) {
  const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="关闭"]');
  close?.click();
}

function hideMatchingJob(company: string, title: string) {
  const normalizedCompany = company.trim().toLowerCase();
  const normalizedTitle = title.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>("article").forEach((article) => {
    const text = (article.textContent || "").toLowerCase();
    if (text.includes(normalizedCompany) && text.includes(normalizedTitle)) {
      article.style.display = "none";
    }
  });
}

async function submitHardRequirement(company: string, title: string, reason: string) {
  const response = await fetch("/api/ignored-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company,
      title,
      reason: `硬性要求不符合：${reason}`,
      exclusionType: "hard_requirement_mismatch",
      learningEligible: false,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "保存失败。");
}

function enhanceDialog(dialog: HTMLElement) {
  if (dialog.dataset.hardRequirementEnhanced === "true") return;
  dialog.dataset.hardRequirementEnhanced = "true";

  const options = dialog.querySelector<HTMLElement>(".ignore-options");
  if (!options) return;

  const hardButton = document.createElement("button");
  hardButton.type = "button";
  hardButton.textContent = "硬性要求不符合";
  hardButton.dataset.ignoreReason = "hard-requirement";
  options.append(hardButton);

  const panel = document.createElement("div");
  panel.hidden = true;
  panel.setAttribute("aria-label", "选择不符合的硬性要求");
  panel.style.display = "none";
  panel.style.gap = "10px";
  panel.style.marginTop = "12px";

  const help = document.createElement("p");
  help.textContent = "只排除当前岗位，不参与负面关键词学习。岗位方向和 JD 关键词仍会保留。";
  help.style.margin = "0 0 4px";
  help.style.fontSize = "14px";
  help.style.lineHeight = "1.6";
  panel.append(help);

  for (const reason of hardRequirementReasons) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = reason;
    button.addEventListener("click", () => {
      const { company, title } = extractTarget(dialog);
      if (!company || !title) {
        help.textContent = "无法识别当前岗位，请刷新页面后重试。";
        return;
      }

      removeCachedJob(company, title);
      hideMatchingJob(company, title);
      closeDialogImmediately(dialog);

      void submitHardRequirement(company, title, reason)
        .then(() => {
          window.location.reload();
        })
        .catch((error) => {
          window.alert(error instanceof Error ? `${error.message} 岗位将重新显示。` : "保存失败，岗位将重新显示。");
          window.location.reload();
        });
    });
    panel.append(button);
  }

  hardButton.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    panel.style.display = opening ? "grid" : "none";
    hardButton.textContent = opening ? "收起硬性要求原因" : "硬性要求不符合";
  });

  options.insertAdjacentElement("afterend", panel);
}

export default function HardRequirementIgnoreActions() {
  useEffect(() => {
    const scan = () => {
      document.querySelectorAll<HTMLElement>(".ignore-dialog").forEach(enhanceDialog);
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
