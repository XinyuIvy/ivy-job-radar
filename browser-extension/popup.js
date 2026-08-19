const status = document.getElementById("status");
const fillButton = document.getElementById("fill");
const importButton = document.getElementById("import");
const optionsButton = document.getElementById("options");
const questionsButton = document.getElementById("questions");
const contextBox = document.getElementById("context");
const candidateWrap = document.getElementById("candidateWrap");
const candidateSelect = document.getElementById("candidate");

let lastQuestions = [];
let currentContext = null;

function show(message, tone = "") {
  status.textContent = message;
  status.dataset.tone = tone;
}

function showContext(title, detail, tone = "") {
  contextBox.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = detail;
  contextBox.append(strong, span);
  contextBox.dataset.tone = tone;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function getStored() {
  return chrome.storage.local.get(["ivyProfile", "ivyRadarConfig"]);
}

function originPattern(origin) {
  return `${new URL(origin).origin}/*`;
}

async function ensureRadarPermission(config, interactive) {
  if (!config?.siteOrigin) return false;
  const origins = [originPattern(config.siteOrigin)];
  const granted = await chrome.permissions.contains({ origins });
  if (granted) return true;
  if (!interactive) return false;
  return chrome.permissions.request({ origins });
}

async function fetchContext(config, jobUrl, applicationId = 0) {
  if (!config?.siteOrigin || !config?.accessKey) return null;
  const endpoint = new URL("/api/autofill/application-context", config.siteOrigin);
  endpoint.searchParams.set("jobUrl", jobUrl || "");
  if (applicationId) endpoint.searchParams.set("applicationId", String(applicationId));
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { "X-Ivy-Autofill-Key": config.accessKey },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Job Radar context failed (${response.status}).`);
  return result;
}

async function fetchApplicationPacket(config, context) {
  if (!config?.siteOrigin || !config?.accessKey || !context?.matched || !context?.application?.id) return null;
  const endpoint = new URL("/api/autofill/application-packet", config.siteOrigin);
  endpoint.searchParams.set("applicationId", String(context.application.id));
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { "X-Ivy-Autofill-Key": config.accessKey },
  });
  if (response.status === 404 || response.status === 409) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Application autofill packet failed (${response.status}).`);
  return result.packet || null;
}

function renderCandidates(context) {
  const candidates = Array.isArray(context?.candidates) ? context.candidates : [];
  candidateSelect.replaceChildren();
  if (!candidates.length || context?.matched) {
    candidateWrap.classList.add("hidden");
    return;
  }
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "请选择已提交申请…";
  candidateSelect.append(blank);
  for (const candidate of candidates) {
    const option = document.createElement("option");
    option.value = String(candidate.id);
    const location = candidate.location ? ` · ${candidate.location}` : "";
    const appId = candidate.applicationId ? ` · ${candidate.applicationId}` : "";
    option.textContent = `${candidate.company} · ${candidate.title}${location}${appId}`;
    candidateSelect.append(option);
  }
  candidateWrap.classList.remove("hidden");
}

function renderContext(context) {
  currentContext = context;
  renderCandidates(context);
  if (!context) {
    showContext("尚未连接 Job Radar", "先到 /autofill 保存资料，并用下面的导入按钮同步到扩展。", "warn");
    return;
  }
  if (context.matched) {
    const app = context.application || {};
    const resume = context.resume || {};
    showContext(
      `${app.company || "当前申请"} · ${app.title || ""}`,
      resume.available
        ? `${app.archiveId || app.applicationId} · 最终定制 CV 已绑定；经历/项目将优先读取该 APP 的最终 CV`
        : `${app.archiveId || app.applicationId || "尚无 APP-ID"} · ${resume.reason === "final-pdf-not-found" ? "最终 PDF 尚未生成" : "尚未建立可用最终 CV"}`,
      resume.available ? "ok" : "warn",
    );
    return;
  }
  if (context.needsSelection) {
    const ambiguous = context.selectionReason === "ambiguous-auto-match";
    showContext(
      ambiguous ? "自动匹配到多个已提交申请" : "没有自动匹配到已提交申请",
      ambiguous
        ? "请在下方手动选择当前岗位；不会猜测并上传错误 CV。"
        : "没关系，可以在下方从已提交申请中手动选择当前岗位。",
      "warn",
    );
    return;
  }
  showContext("没有可选的已提交申请", "仍可填写标准资料，但不会使用 application-specific 经历或 CV。", "warn");
}

async function refreshContext(interactive = false) {
  const tab = await activeTab();
  const { ivyRadarConfig } = await getStored();
  if (!ivyRadarConfig) return renderContext(null);
  if (!tab?.url || !/^https?:/i.test(tab.url)) return renderContext(null);
  if (!await ensureRadarPermission(ivyRadarConfig, interactive)) {
    showContext("需要一次站点权限", "点“填写当前申请页 + CV”时授权扩展读取你自己的 Job Radar application context。", "warn");
    return null;
  }
  try {
    const context = await fetchContext(ivyRadarConfig, tab.url);
    renderContext(context);
    return context;
  } catch (error) {
    showContext("Job Radar 连接失败", String(error.message || error), "warn");
    return null;
  }
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

async function attachResume(tabId, config, context) {
  if (!context?.matched || !context?.resume?.available || !context?.application?.id) return { uploaded: 0, reason: "not-available" };
  const endpoint = new URL("/api/autofill/resume", config.siteOrigin);
  endpoint.searchParams.set("applicationId", String(context.application.id));
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { "X-Ivy-Autofill-Key": config.accessKey },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `CV download failed (${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  return chrome.tabs.sendMessage(tabId, {
    type: "IVY_UPLOAD_RESUME",
    fileName: context.resume.fileName,
    mimeType: "application/pdf",
    base64: bufferToBase64(buffer),
  });
}

candidateSelect.addEventListener("change", async () => {
  const applicationId = Number(candidateSelect.value);
  if (!applicationId) return;
  const tab = await activeTab();
  const { ivyRadarConfig } = await getStored();
  if (!tab?.url || !ivyRadarConfig) return;
  try {
    const context = await fetchContext(ivyRadarConfig, tab.url, applicationId);
    renderContext(context);
  } catch (error) {
    show(String(error.message || error), "error");
  }
});

fillButton.addEventListener("click", async () => {
  fillButton.disabled = true;
  show("正在识别当前 APP 并填写页面…");
  try {
    const tab = await activeTab();
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) return show("请先打开招聘申请页面。", "error");
    const stored = await getStored();
    if (!stored.ivyProfile) return show("还没有申请资料。先打开“编辑资料”或从 Job Radar 导入。", "error");

    let context = currentContext;
    let applicationPacket = null;
    if (stored.ivyRadarConfig && await ensureRadarPermission(stored.ivyRadarConfig, true)) {
      const selectedId = Number(candidateSelect.value || 0);
      context = await fetchContext(stored.ivyRadarConfig, tab.url, selectedId);
      renderContext(context);
      applicationPacket = await fetchApplicationPacket(stored.ivyRadarConfig, context);
    }

    await ensureContentScript(tab.id);
    const fillResult = await chrome.tabs.sendMessage(tab.id, {
      type: "IVY_FILL_PAGE",
      applicationPacket,
    });
    if (!fillResult?.ok) return show(fillResult?.error || "自动填写失败。", "error");

    lastQuestions = Array.isArray(fillResult.unresolved) ? fillResult.unresolved : [];
    questionsButton.classList.toggle("hidden", lastQuestions.length === 0);

    let uploadResult = { uploaded: 0, reason: "not-available" };
    if (stored.ivyRadarConfig && context?.matched && context?.resume?.available) {
      uploadResult = await attachResume(tab.id, stored.ivyRadarConfig, context);
    }

    const sensitive = fillResult.skippedSensitive?.length ? "；敏感/EEO 项已跳过" : "";
    const cv = uploadResult?.uploaded ? "；已上传对应定制 CV" : context?.matched ? "；未上传 CV（最终 PDF 不可用或页面未找到 Resume 字段）" : "；未绑定 application-specific CV";
    const appData = applicationPacket ? `；经历/项目来自 ${applicationPacket.application_id || context?.application?.archiveId || "当前 APP"} 最终 CV` : context?.matched ? "；未找到最终 CV 的结构化经历包，经历字段回退到标准资料" : "";
    const unresolved = lastQuestions.length ? `；另有 ${lastQuestions.length} 个未填问题` : "";
    show(`${fillResult.platform}: 已填写 ${fillResult.filled} 个字段${appData}${cv}${unresolved}${sensitive}。请检查后手动提交。`, fillResult.filled || uploadResult?.uploaded ? "ok" : "warn");
  } catch (error) {
    show(`自动填写失败：${error.message || error}`, "error");
  } finally {
    fillButton.disabled = false;
  }
});

questionsButton.addEventListener("click", async () => {
  if (!lastQuestions.length) return;
  await navigator.clipboard.writeText(["当前申请页仍未填写的问题：", ...lastQuestions.map((question, index) => `${index + 1}. ${question}`)].join("\n"));
  show(`已复制 ${lastQuestions.length} 个未填问题，可以粘贴到 Chat 里逐项生成答案。`, "ok");
});

importButton.addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) return show("请先打开 Ivy Job Radar 的 /autofill 页面。", "error");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        profile: localStorage.getItem("ivy_job_application_profile_v1"),
        config: localStorage.getItem("ivy_job_autofill_config_v1"),
        origin: location.origin,
      }),
    });
    if (!result?.profile) return show("当前页面没有保存的 Job Radar 申请资料。请先在 /autofill 点“保存资料”。", "error");
    const profile = JSON.parse(result.profile);
    const config = result.config ? JSON.parse(result.config) : null;
    if (!config?.accessKey) return show("当前 Job Radar 还没有生成扩展桥接信息。请部署最新版 Site 后刷新 /autofill。", "error");
    config.siteOrigin = result.origin || config.siteOrigin;
    const granted = await ensureRadarPermission(config, true);
    if (!granted) return show("没有授予 Job Radar 站点权限；基础字段仍可使用，但不能自动匹配并上传定制 CV。", "warn");
    await chrome.storage.local.set({ ivyProfile: profile, ivyRadarConfig: config });
    show("已导入申请资料并连接 Job Radar。以后在招聘页可识别当前 APP，并从该 APP 最终定制 CV 读取经历/项目和上传 PDF。", "ok");
    renderContext(null);
  } catch (error) {
    show(`导入失败：${error.message || error}`, "error");
  }
});

optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

void refreshContext(false);
