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

export type CvPrebuildSummaryBucket = "queued" | "running" | "ready" | "needs_action";

export function cvPrebuildSummaryBucket(status?: string | null): CvPrebuildSummaryBucket {
  if (["queued", "preparing_bundle", "agent_queued"].includes(status ?? "")) return "queued";
  if (status === "agent_running") return "running";
  if (status === "ready") return "ready";
  return "needs_action";
}

export function cvPrebuildFailureMessage(errorCode?: string | null) {
  const code = String(errorCode || "").trim();
  if (!code) return "任务没有留下具体错误信息。打开详情不会调用生成 API。";
  if (code === "OPENAI_FAILED") {
    return "OpenAI 后台任务失败。旧记录没有保存更具体的原因，打开详情后会做一次免费状态诊断。";
  }
  if (code.startsWith("OPENAI_FAILED:")) {
    return `OpenAI 后台任务失败：${code.slice("OPENAI_FAILED:".length).trim()}`;
  }
  if (code.startsWith("OPENAI_INCOMPLETE:")) {
    return `OpenAI 未完成本次任务：${code.slice("OPENAI_INCOMPLETE:".length).trim()}`;
  }
  if (code === "CV_ARTIFACT_PERSIST_FAILED") {
    return "AI 已结束，但 CV 文件没有成功保存。";
  }
  if (code === "PREBUILD_BUNDLE_FAILED") {
    return "CV 材料包创建失败。";
  }
  return `失败代码：${code}`;
}

export function initialCvPrebuildStatus(
  description: string,
  hasAgentConfiguration: boolean,
): CvPrebuildStatus {
  if (!description.trim()) return "blocked_missing_jd";
  return hasAgentConfiguration ? "queued" : "blocked_configuration";
}

export function cvPrebuildStatusView(status?: string | null) {
  const views: Record<CvPrebuildStatus, { label: string; tone: "active" | "blocked" | "ready" | "warning" | "neutral" }> = {
    queued: { label: "CV 预生成：等待启动", tone: "neutral" },
    preparing_bundle: { label: "CV 预生成：准备材料", tone: "active" },
    agent_queued: { label: "CV 预生成：AI 排队中", tone: "active" },
    agent_running: { label: "CV 预生成：生成中", tone: "active" },
    ready: { label: "CV 预生成：初稿可用", tone: "ready" },
    blocked_missing_jd: { label: "CV 预生成：缺少完整 JD", tone: "blocked" },
    blocked_configuration: { label: "CV 预生成：等待 API 配置", tone: "blocked" },
    stale: { label: "CV 预生成：需要重新生成", tone: "warning" },
    failed_retryable: { label: "CV 预生成：失败，可重试", tone: "warning" },
    failed_terminal: { label: "CV 预生成：失败，需处理", tone: "warning" },
    cancelled: { label: "CV 预生成：已取消", tone: "neutral" },
  };
  return status && status in views ? views[status as CvPrebuildStatus] : null;
}
