import { extractCoreJobDescription } from "./job-description";

export const activeJobStatuses = new Set(["开放", "待官网核验", "已捕获完整JD", "待核验"]);

const closedPostingPattern = /no longer accepting applications|no longer available|job (?:is )?closed|position (?:has been )?filled|posting (?:has been )?removed|职位已下线|停止招聘|招聘已结束|职位不存在|该职位已关闭/i;

export function deadlineHasPassed(deadline: string, deadlineType: string, now: string) {
  return deadlineType === "date" && /^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline < now.slice(0, 10);
}

export async function verifyPosting(jobUrl: string, expectedTitle?: string) {
  try {
    const response = await fetch(jobUrl, {
      headers: { Accept: "text/html,application/json", "User-Agent": "IvyJobRadar/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404 || response.status === 410) {
      return { state: "expired" as const, reason: `官网返回 ${response.status}` };
    }
    if (!response.ok) return { state: "unknown" as const, reason: `官网暂时返回 ${response.status}` };
    const text = (await response.text()).slice(0, 250_000);
    if (closedPostingPattern.test(text)) {
      return { state: "expired" as const, reason: "官网明确显示岗位已关闭" };
    }
    const description = extractCoreJobDescription(text).text;
    const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const titleMatches = !!expectedTitle && normalize(description).includes(normalize(expectedTitle));
    const hasRequirements = /qualifications?|responsibilities|requirements?|岗位职责|任职要求|工作职责/i.test(description);
    if (!titleMatches || description.length < 300 || !hasRequirements) {
      return { state: "unknown" as const, reason: "页面可访问，但未确认对应岗位的完整 JD" };
    }
    return {
      state: "open" as const,
      reason: "已读取对应岗位 JD",
      description,
      canonicalUrl: response.url || jobUrl,
    };
  } catch {
    return { state: "unknown" as const, reason: "岗位链接暂时无法核验" };
  }
}
