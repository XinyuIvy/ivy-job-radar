"use client";

import { useEffect } from "react";

const hardRequirementReasons = [
  "经验年限或职级不符合",
  "学历或专业要求不符合",
  "工作授权或 sponsorship 不符合",
  "地点或工作方式不符合",
  "必备技能、证书或语言不符合",
  "其他硬性条件不符合",
];

function normalize(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function findMatchingCard(company: string, title: string) {
  const companyKey = normalize(company);
  const titleKey = normalize(title);
  return Array.from(document.querySelectorAll<HTMLElement>(".job-card")).find((card) => {
    const text = normalize(card.textContent);
    return Boolean(companyKey && titleKey && text.includes(companyKey) && text.includes(titleKey));
  }) ?? null;
}

function extractTarget(dialog: HTMLElement) {
  const title = dialog.querySelector("#ignore-title")?.textContent?.trim() || "";
  const description = dialog.querySelector(":scope > p")?.textContent?.trim() || "";
  const company = description.split("·")[0]?.trim() || "";
  const card = findMatchingCard(company, title);
  const jobUrl = card?.querySelector<HTMLAnchorElement>("a.job-link")?.href || "";
  return { company, title, jobUrl, card };
}

function closeDialog(dialog: HTMLElement) {
  dialog.querySelector<HTMLButtonElement>('button[aria-label="关闭"]')?.click();
}

function hideMatchingJob(card: HTMLElement | null) {
  if (!card) return;
  card.dataset.optimisticIgnored = "true";
  card.style.setProperty("display", "none", "important");
  card.setAttribute("aria-hidden", "true");
}

async function submitHardRequirement(company: string, title: string, jobUrl: string, reason: string) {
  const response = await fetch("/api/ignored-jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company,
      title,
      jobUrl,
      reason: `硬性要求不符合：${reason}`,
      exclusionType: "hard_requirement_mismatch",
      learningEligible: false,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "保存失败。");
}

function setPanelBusy(panel: HTMLElement, busy: boolean) {
  panel.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = busy;
  });
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
  const defaultHelp = "只排除当前岗位，不参与负面关键词学习。岗位方向和 JD 关键词仍会保留。";
  help.textContent = defaultHelp;
  help.style.margin = "0 0 4px";
  help.style.fontSize = "14px";
  help.style.lineHeight = "1.6";
  panel.append(help);

  for (const reason of hardRequirementReasons) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = reason;
    button.addEventListener("click", async () => {
      const { company, title, jobUrl, card } = extractTarget(dialog);
      if (!company || !title) {
        help.textContent = "无法识别当前岗位，请刷新页面后重试。";
        return;
      }

      setPanelBusy(panel, true);
      hardButton.disabled = true;
      help.textContent = "正在保存忽略原因并从岗位列表移除…";
      try {
        await submitHardRequirement(company, title, jobUrl, reason);
        hideMatchingJob(card);
        help.textContent = "已保存。岗位正在从列表移除。";
        window.dispatchEvent(new CustomEvent("ivy-job-radar:job-ignored", { detail: { company, title } }));
        closeDialog(dialog);
      } catch (error) {
        help.textContent = error instanceof Error ? `${error.message} 请重试。` : "保存失败，请重试。";
        setPanelBusy(panel, false);
        hardButton.disabled = false;
      }
    });
    panel.append(button);
  }

  hardButton.addEventListener("click", () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    panel.style.display = opening ? "grid" : "none";
    hardButton.textContent = opening ? "收起硬性要求原因" : "硬性要求不符合";
    if (opening) help.textContent = defaultHelp;
  });

  options.insertAdjacentElement("afterend", panel);
}

export default function HardRequirementIgnoreActions() {
  useEffect(() => {
    let timer = 0;
    const scan = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.querySelectorAll<HTMLElement>(".ignore-dialog").forEach(enhanceDialog), 60);
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);
  return null;
}
