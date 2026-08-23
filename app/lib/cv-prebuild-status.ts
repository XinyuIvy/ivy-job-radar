export const cvPrebuildStatuses = [
  "queued",
  "preparing_bundle",
  "agent_queued",
  "agent_running",
  "ready",
  "blocked_missing_jd",
  "blocked_configuration",
  "stale",
  "failed_retryable",
  "failed_terminal",
  "cancelled",
] as const;

export type CvPrebuildStatus = (typeof cvPrebuildStatuses)[number];

export function initialCvPrebuildStatus(
  description: string,
  hasAgentConfiguration: boolean,
): CvPrebuildStatus {
  if (!description.trim()) return "blocked_missing_jd";
  return hasAgentConfiguration ? "queued" : "blocked_configuration";
}

export function cvPrebuildStatusView(status?: string | null) {
  const views: Record<CvPrebuildStatus, { label: string; tone: "active" | "blocked" | "ready" | "warning" | "neutral" }> = {
    queued: { label: "CV 预生成：排队中", tone: "active" },
    preparing_bundle: { label: "CV 预生成：准备材料", tone: "active" },
    agent_queued: { label: "CV 预生成：Agent 排队中", tone: "active" },
    agent_running: { label: "CV 预生成：生成中", tone: "active" },
    ready: { label: "CV 预生成：初稿可用", tone: "ready" },
    blocked_missing_jd: { label: "CV 预生成：缺少完整 JD", tone: "blocked" },
    blocked_configuration: { label: "CV 预生成：等待 Agent 配置", tone: "blocked" },
    stale: { label: "CV 预生成：需要重新生成", tone: "warning" },
    failed_retryable: { label: "CV 预生成：失败，可重试", tone: "warning" },
    failed_terminal: { label: "CV 预生成：失败，需处理", tone: "warning" },
    cancelled: { label: "CV 预生成：已取消", tone: "neutral" },
  };
  return status && status in views ? views[status as CvPrebuildStatus] : null;
}
