const status = document.getElementById("status");
const fillButton = document.getElementById("fill");
const importButton = document.getElementById("import");
const optionsButton = document.getElementById("options");
const questionsButton = document.getElementById("questions");
const contextBox = document.getElementById("context");
const candidateWrap = document.getElementById("candidateWrap");
const candidateSelect = document.getElementById("candidate");
const refreshFreezeButton = document.getElementById("refreshFreeze");
const profileLanguageSelect = document.getElementById("profileLanguage");
const automationBox = document.getElementById("automation");
const runAutomationButton = document.getElementById("runAutomation");

let lastQuestions = [];
let currentContext = null;
let selectedApplicationRowId = 0;
let selectedTemplateFile = "";

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
  return chrome.storage.local.get(["ivyProfile", "ivyRadarConfig", "ivyAutofillLanguage"]);
}

async function restoreProfileLanguage() {
  const { ivyAutofillLanguage } = await getStored();
  if (ivyAutofillLanguage === "zh" || ivyAutofillLanguage === "en") {
    profileLanguageSelect.value = ivyAutofillLanguage;
  }
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

async function fetchContext(config, jobUrl, applicationId = 0, templateFile = "") {
  if (!config?.siteOrigin || !config?.accessKey) return null;
  const endpoint = new URL("/api/autofill/application-context", config.siteOrigin);
  endpoint.searchParams.set("jobUrl", jobUrl || "");
  if (applicationId) endpoint.searchParams.set("applicationId", String(applicationId));
  if (templateFile) endpoint.searchParams.set("templateFile", templateFile);
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { "X-Ivy-Autofill-Key": config.accessKey },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Job Radar context failed (${response.status}).`);
  return result;
}

async function fetchApplicationPacket(config, context) {
  if (!config?.siteOrigin || !config?.accessKey || !context?.selected) return null;
  const endpoint = new URL("/api/autofill/application-packet", config.siteOrigin);
  if (context.selectionType === "template") endpoint.searchParams.set("templateFile", context.template.filename);
  else if (context.application?.id) endpoint.searchParams.set("applicationId", String(context.application.id));
  else return null;
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { "X-Ivy-Autofill-Key": config.accessKey },
  });
  if (response.status === 404 || response.status === 409) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Application autofill packet failed (${response.status}).`);
  return result.packet || null;
}

async function fetchGlobalProfile(config) {
  if (!config?.siteOrigin || !config?.accessKey) return null;
  const endpoint = new URL("/api/autofill/general-profile", config.siteOrigin);
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { "X-Ivy-Autofill-Key": config.accessKey },
  });
  if (response.status === 404) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Global autofill profile failed (${response.status}).`);
  return result.profile || null;
}

async function refreshAutomation() {
  const { ivyRadarConfig } = await getStored();
  const detail = automationBox.querySelector("span");
  if (!ivyRadarConfig?.siteOrigin || !ivyRadarConfig?.accessKey) {
    detail.textContent = "连接 Job Radar 后才会读取自动投递任务。";
    return;
  }
  try {
    const endpoint = new URL("/api/application-automation/extension", ivyRadarConfig.siteOrigin);
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { "X-Ivy-Autofill-Key": ivyRadarConfig.accessKey },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Queue request failed (${response.status}).`);
    const mode = "最终提交由你完成";
    detail.textContent = `${mode} · 等待执行 ${result.ready?.length || 0} · 浏览器处理中 ${result.active?.length || 0}`;
    automationBox.dataset.tone = result.ready?.length ? "ready" : "";
  } catch (error) {
    detail.textContent = `队列读取失败：${error.message || error}`;
    automationBox.dataset.tone = "error";
  }
}

function renderSources(context) {
  const candidates = Array.isArray(context?.candidates) ? context.candidates : [];
  const templates = Array.isArray(context?.templates) ? context.templates : [];
  candidateSelect.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "请选择岗位或 CV 母版…";
  candidateSelect.append(blank);

  const applicationGroup = document.createElement("optgroup");
  applicationGroup.label = "已申请岗位 · 使用岗位冻结资料";
  for (const candidate of candidates) {
    const option = document.createElement("option");
    option.value = `application:${candidate.id}`;
    const location = candidate.location ? ` · ${candidate.location}` : "";
    const appId = candidate.archiveId || candidate.applicationId ? ` · ${candidate.archiveId || candidate.applicationId}` : "";
    option.textContent = `${candidate.company} · ${candidate.title}${location}${appId}`;
    applicationGroup.append(option);
  }
  if (applicationGroup.children.length) candidateSelect.append(applicationGroup);

  for (const language of ["zh", "en"]) {
    const group = document.createElement("optgroup");
    group.label = language === "zh" ? "中文 CV 母版 · 实时最新版" : "English CV templates · live";
    for (const template of templates.filter((item) => item.language === language)) {
      const option = document.createElement("option");
      option.value = `template:${template.filename}`;
      option.textContent = `${template.label} · ${template.filename}`;
      group.append(option);
    }
    if (group.children.length) candidateSelect.append(group);
  }

  if (context?.selectionType === "application" && context.application?.id) {
    candidateSelect.value = `application:${context.application.id}`;
  } else if (context?.selectionType === "template" && context.template?.filename) {
    candidateSelect.value = `template:${context.template.filename}`;
  }
  candidateWrap.classList.remove("hidden");
}

function renderContext(context) {
  currentContext = context;
  renderSources(context);
  contextBox.dataset.matched = context?.matched ? "true" : "false";
  refreshFreezeButton.classList.add("hidden");
  if (!context) {
    showContext("尚未连接 Job Radar", "先到 /autofill 保存资料，并用下面的导入按钮同步到扩展。", "warn");
    return;
  }
  if (context.matched) {
    const app = context.application || {};
    const resume = context.resume || {};
    if (Number(app.id) > 0) selectedApplicationRowId = Number(app.id);
    selectedTemplateFile = "";
    if (app.archiveId && context.templateFile && resume.source !== "customized") refreshFreezeButton.classList.remove("hidden");
    showContext(
      `${app.company || "当前申请"} · ${app.title || ""}`,
      resume.available
        ? `${app.archiveId || app.applicationId} · ${resume.source === "submitted" ? "实际提交 CV 已冻结" : resume.source === "template" ? "所选 CV 母版已作为定稿绑定" : "最终定制 CV 已绑定"}；项目/经历来自对应定稿 CV，固定申请资料来自 global profile`
        : `${app.archiveId || app.applicationId || "尚无 APP-ID"} · ${resume.reason === "final-pdf-not-found" ? "最终 PDF 尚未生成" : "尚未建立可用最终 CV"}`,
      resume.available ? "ok" : "warn",
    );
    return;
  }
  if (context.selected && context.selectionType === "template") {
    selectedApplicationRowId = 0;
    selectedTemplateFile = context.template?.filename || "";
    const resume = context.resume || {};
    showContext(
      `实时母版 · ${context.template?.label || selectedTemplateFile}`,
      resume.available
        ? "填表项目、工作经历和 PDF 每次都从 GitHub 当前母版读取，不绑定任何岗位。"
        : "已找到母版源文件，但当前同名 PDF 不可用。",
      resume.available ? "ok" : "warn",
    );
    return;
  }
  if (context.needsSelection) {
    const ambiguous = context.selectionReason === "ambiguous-auto-match";
    showContext(
      ambiguous ? "自动匹配到多个已提交申请" : "没有自动匹配到已提交申请",
      ambiguous
        ? "请在下方选择正确岗位，或直接选择一份 CV 母版。"
        : "可以在下方选择一个已申请岗位，也可以直接选择 CV 母版。",
      "warn",
    );
    return;
  }
  showContext("尚未选择填表来源", "请选择一个岗位或 CV 母版。", "warn");
}

async function refreshContext(interactive = false) {
  const tab = await activeTab();
  const { ivyRadarConfig, ivyAutofillLanguage } = await getStored();
  if (!ivyRadarConfig) return renderContext(null);
  if (!tab?.url || !/^https?:/i.test(tab.url)) return renderContext(null);
  if (!await ensureRadarPermission(ivyRadarConfig, interactive)) {
    showContext("需要一次站点权限", "点“填写当前申请页 + CV”时授权扩展读取你自己的 Job Radar application context。", "warn");
    return null;
  }
  try {
    const context = await fetchContext(ivyRadarConfig, tab.url);
    renderContext(context);
    if (!ivyAutofillLanguage) {
      try {
        const generalProfile = await fetchGlobalProfile(ivyRadarConfig);
        const defaultLanguage = generalProfile?.fixed_application?.defaultLanguage;
        if (defaultLanguage === "zh" || defaultLanguage === "en") profileLanguageSelect.value = defaultLanguage;
      } catch {
        // The visible selector remains usable when the profile endpoint is temporarily unavailable.
      }
    }
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
  if (!context?.selected || !context?.resume?.available) return { uploaded: 0, reason: "not-available" };
  const endpoint = new URL("/api/autofill/resume", config.siteOrigin);
  if (context.selectionType === "template") endpoint.searchParams.set("templateFile", context.template.filename);
  else if (context.application?.id) endpoint.searchParams.set("applicationId", String(context.application.id));
  else return { uploaded: 0, reason: "not-available" };
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
  const value = candidateSelect.value;
  if (!value) return;
  const [kind, rawValue] = value.includes(":") ? value.split(":", 2) : ["application", value];
  const applicationId = kind === "application" ? Number(rawValue) : 0;
  const templateFile = kind === "template" ? rawValue : "";
  if (!applicationId && !templateFile) return;
  selectedApplicationRowId = applicationId;
  selectedTemplateFile = templateFile;
  const tab = await activeTab();
  const { ivyRadarConfig } = await getStored();
  if (!tab?.url || !ivyRadarConfig) return;
  try {
    const context = await fetchContext(ivyRadarConfig, tab.url, applicationId, templateFile);
    renderContext(context);
  } catch (error) {
    show(String(error.message || error), "error");
  }
});

profileLanguageSelect.addEventListener("change", async () => {
  await chrome.storage.local.set({ ivyAutofillLanguage: profileLanguageSelect.value });
});

fillButton.addEventListener("click", async () => {
  fillButton.disabled = true;
  show("正在读取所选岗位或母版，并填写当前页面…");
  try {
    const tab = await activeTab();
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) return show("请先打开招聘申请页面。", "error");
    const stored = await getStored();
    if (!stored.ivyProfile && !stored.ivyRadarConfig) return show("还没有连接 Job Radar。请先在 /autofill 页面导入连接。", "error");

    let context = currentContext;
    let applicationPacket = null;
    let generalProfile = null;
    let globalProfileWarning = "";
    if (stored.ivyRadarConfig && await ensureRadarPermission(stored.ivyRadarConfig, true)) {
      const selectedId = Number(currentContext?.selectionType === "application" && currentContext?.application?.id
        ? currentContext.application.id
        : selectedApplicationRowId || 0);
      const templateFile = currentContext?.selectionType === "template"
        ? currentContext.template?.filename || ""
        : selectedTemplateFile;
      context = await fetchContext(stored.ivyRadarConfig, tab.url, selectedId, templateFile);
      renderContext(context);
      if (!context?.selected) return show("请先从下拉菜单选择一个岗位或 CV 母版。", "error");
      applicationPacket = await fetchApplicationPacket(stored.ivyRadarConfig, context);
      try {
        generalProfile = await fetchGlobalProfile(stored.ivyRadarConfig);
      } catch (error) {
        globalProfileWarning = `；global profile 暂不可用：${error.message || error}`;
      }
    }

    await ensureContentScript(tab.id);
    const fillResult = await chrome.tabs.sendMessage(tab.id, {
      type: "IVY_FILL_PAGE",
      applicationPacket,
      generalProfile,
      profileLanguage: profileLanguageSelect.value,
    });
    if (!fillResult?.ok) return show(fillResult?.error || "自动填写失败。", "error");

    lastQuestions = Array.isArray(fillResult.unresolved) ? fillResult.unresolved : [];
    questionsButton.classList.toggle("hidden", lastQuestions.length === 0);

    let uploadResult = { uploaded: 0, reason: "not-available" };
    if (stored.ivyRadarConfig && context?.selected && context?.resume?.available) {
      uploadResult = await attachResume(tab.id, stored.ivyRadarConfig, context);
    }

    const sensitive = fillResult.skippedSensitive?.length ? "；敏感/EEO 项已跳过" : "";
    const cv = uploadResult?.uploaded
      ? context?.selectionType === "template" ? "；已上传 GitHub 当前母版 CV" : context?.resume?.source === "submitted" ? "；已上传冻结的实际提交 CV" : context?.resume?.source === "template" ? "；已上传保存岗位时选择的母版 CV" : "；已上传对应定制 CV"
      : context?.selected ? "；未上传 CV（PDF 不可用或页面未找到 Resume 字段）" : "；未选择 CV 来源";
    const appData = applicationPacket
      ? applicationPacket.provenance === "live_template"
        ? `；项目/经历来自实时母版 ${context?.template?.filename || ""}`
        : applicationPacket.provenance === "refreshed_template_autofill"
          ? `；项目/经历来自 ${applicationPacket.application_id || "当前 APP"} 更新后的母版条目`
          : applicationPacket.provenance === "frozen_submitted_template"
        ? `；项目/经历来自 ${applicationPacket.application_id || context?.application?.archiveId || "当前 APP"} 冻结母版`
        : `；项目/经历来自 ${applicationPacket.application_id || context?.application?.archiveId || "当前 APP"} 最终定制 CV`
      : context?.selected ? "；未找到所选来源的结构化经历包" : "";
    const globalData = generalProfile ? "；固定教育/申请字段已合并 global profile" : "";
    const unresolved = lastQuestions.length ? `；另有 ${lastQuestions.length} 个未填问题` : "";
    const fieldKinds = Array.isArray(fillResult.fields) ? fillResult.fields.length : 0;
    const fieldSummary = fieldKinds ? `（${fieldKinds} 类字段）` : "";
    show(`${fillResult.platform}: 已写入 ${fillResult.filled} 个表单控件${fieldSummary}${globalData}${appData}${cv}${unresolved}${sensitive}${globalProfileWarning}。请逐栏检查后手动提交。`, fillResult.filled || uploadResult?.uploaded ? "ok" : "warn");
  } catch (error) {
    show(`自动填写失败：${error.message || error}`, "error");
  } finally {
    fillButton.disabled = false;
  }
});

refreshFreezeButton.addEventListener("click", async () => {
  const applicationId = Number(currentContext?.application?.id || selectedApplicationRowId || 0);
  if (!applicationId) return show("请先选择一个已申请岗位。", "error");
  refreshFreezeButton.disabled = true;
  show("正在用 GitHub 当前母版更新该岗位的项目和经历条目…");
  try {
    const { ivyRadarConfig } = await getStored();
    if (!ivyRadarConfig?.siteOrigin || !ivyRadarConfig?.accessKey) throw new Error("尚未连接 Job Radar。");
    const endpoint = new URL("/api/autofill/application-packet", ivyRadarConfig.siteOrigin);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ivy-Autofill-Key": ivyRadarConfig.accessKey,
      },
      body: JSON.stringify({ applicationId }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || `更新失败 (${response.status})`);
    show(`已更新 ${result.experienceCount || 0} 条经历和 ${result.projectCount || 0} 个项目。原来冻结的 JD 和提交 PDF 没有改动。`, "ok");
  } catch (error) {
    show(`更新冻结项目失败：${error.message || error}`, "error");
  } finally {
    refreshFreezeButton.disabled = false;
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
    const profile = result?.profile ? JSON.parse(result.profile) : {};
    const config = result.config ? JSON.parse(result.config) : null;
    if (!config?.accessKey) return show("当前 Job Radar 还没有生成扩展桥接信息。请部署最新版 Site 后刷新 /autofill。", "error");
    config.siteOrigin = result.origin || config.siteOrigin;
    const granted = await ensureRadarPermission(config, true);
    if (!granted) return show("没有授予 Job Radar 站点权限；基础字段仍可使用，但不能读取 global profile、匹配 APP 或上传定制 CV。", "warn");
    await chrome.storage.local.set({ ivyProfile: profile, ivyRadarConfig: config });
    show("已连接 Job Radar。填写时会实时读取网站里的申请固定资料；教育和经历仍按 CV 事实库及当前 APP 最终 CV 读取。", "ok");
    renderContext(null);
  } catch (error) {
    show(`导入失败：${error.message || error}`, "error");
  }
});

optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

runAutomationButton.addEventListener("click", async () => {
  runAutomationButton.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ type: "IVY_RUN_AUTOMATION_NOW" });
    if (!result?.ok) throw new Error(result?.error || "自动投递检查失败。");
    show("已检查自动投递队列。已生成 CV 的任务会由浏览器继续处理。", "ok");
    await refreshAutomation();
  } catch (error) {
    show(`队列检查失败：${error.message || error}`, "error");
  } finally {
    runAutomationButton.disabled = false;
  }
});

void restoreProfileLanguage();
void refreshContext(false);
void refreshAutomation();
