export const CV_PREBUILD_AUTOMATION_PAUSED = true;

export const CV_AUTOMATION_PAUSED_PAYLOAD = {
  error: "CV 自动生成暂时停用；prompt-v1.9.4-site.3 已接入本地代码，但尚未发布或启用生成。",
  code: "CV_AUTOMATION_PAUSED",
} as const;
