const AUTOMATION_ALARM = "ivy-job-radar-automation";
let running = false;

function endpoint(config, path) {
  return new URL(path, config.siteOrigin).toString();
}

async function storedConfig() {
  const stored = await chrome.storage.local.get(["ivyRadarConfig", "ivyProfile", "ivyAutofillLanguage"]);
  return stored;
}

async function apiRequest(config, path, options = {}) {
  const response = await fetch(endpoint(config, path), {
    cache: "no-store",
    ...options,
    headers: {
      "X-Ivy-Autofill-Key": config.accessKey,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : response;
  if (!response.ok) throw new Error(payload?.error || `Job Radar request failed (${response.status}).`);
  return payload;
}

async function updateTask(config, taskId, claimToken, status, stage, extra = {}) {
  return apiRequest(config, "/api/application-automation/extension", {
    method: "POST",
    body: JSON.stringify({ taskId, claimToken, status, stage, ...extra }),
  });
}

async function waitForTab(tabId, timeoutMs = 25000) {
  const current = await chrome.tabs.get(tabId).catch(() => null);
  if (current?.status === "complete") return current;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Application page did not finish loading."));
    }, timeoutMs);
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function sendToTab(tabId, message) {
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, message);
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

async function fetchGeneralProfile(config) {
  const result = await apiRequest(config, "/api/autofill/general-profile");
  return result.profile || null;
}

async function fetchResume(config, taskId) {
  const response = await fetch(endpoint(config, `/api/application-automation/extension/resume?taskId=${taskId}`), {
    cache: "no-store",
    headers: { "X-Ivy-Autofill-Key": config.accessKey },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Customized CV download failed (${response.status}).`);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const fileName = disposition.match(/filename="([^"]+)"/i)?.[1] || `ivy-customized-cv-${taskId}.pdf`;
  return { fileName, base64: bufferToBase64(await response.arrayBuffer()) };
}

async function reachApplicationForm(tabId) {
  await waitForTab(tabId);
  const entry = await sendToTab(tabId, { type: "IVY_OPEN_APPLICATION_FORM" }).catch(() => ({ clicked: false }));
  if (!entry?.clicked) return;
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await waitForTab(tabId, 20000).catch(() => null);
  await ensureContentScript(tabId);
}

async function runTask(config, task, language) {
  const claim = await apiRequest(config, "/api/application-automation/extension", {
    method: "POST",
    body: JSON.stringify({ taskId: task.id, action: "claim" }),
  });
  const claimToken = claim.claimToken;
  let tabId = 0;
  try {
    const tab = await chrome.tabs.create({ url: task.jobUrl, active: false });
    tabId = tab.id;
    await updateTask(config, task.id, claimToken, "filling", "opening_application_page");
    await reachApplicationForm(tabId);

    const [generalProfile, resume] = await Promise.all([
      fetchGeneralProfile(config),
      fetchResume(config, task.id),
    ]);
    const fillResult = await sendToTab(tabId, {
      type: "IVY_FILL_PAGE",
      generalProfile,
      applicationPacket: null,
      profileLanguage: task.language || language || "en",
    });
    const uploadResult = await sendToTab(tabId, {
      type: "IVY_UPLOAD_RESUME",
      fileName: resume.fileName,
      mimeType: "application/pdf",
      base64: resume.base64,
    });
    const audit = await sendToTab(tabId, { type: "IVY_AUDIT_APPLICATION_FORM" });
    const blockers = [...(audit?.blockers || [])];
    if (!fillResult?.ok) blockers.push("自动填写没有成功完成");
    if (!uploadResult?.uploaded) blockers.push("没有找到可用的 Resume/CV 上传字段");

    if (blockers.length || !task.allowFinalSubmit) {
      await updateTask(config, task.id, claimToken, "needs_review", "browser_review_required", {
        confirmationText: JSON.stringify({
          blockers,
          filled: fillResult?.filled || 0,
          unresolved: fillResult?.unresolved || [],
          requiredEmpty: audit?.requiredEmpty || [],
          platform: audit?.platform || "Unknown ATS",
          tabId,
        }),
      });
      return;
    }

    const submitted = await sendToTab(tabId, { type: "IVY_CLICK_SAFE_SUBMIT" });
    if (!submitted?.clicked) {
      await updateTask(config, task.id, claimToken, "needs_review", "submit_guard_blocked", {
        confirmationText: JSON.stringify(submitted?.audit || {}),
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 4500));
    await ensureContentScript(tabId).catch(() => null);
    const confirmation = await chrome.tabs.sendMessage(tabId, { type: "IVY_CONFIRM_SUBMISSION" }).catch(() => ({ confirmed: false }));
    if (!confirmation?.confirmed) {
      await updateTask(config, task.id, claimToken, "needs_review", "submission_confirmation_missing", {
        confirmationText: "最终提交按钮已点击，但没有识别到申请成功回执。",
      });
      return;
    }
    await updateTask(config, task.id, claimToken, "submitted", "submission_confirmed", {
      confirmationText: confirmation.text || "Application submitted and confirmation detected.",
    });
    await chrome.tabs.remove(tabId).catch(() => null);
  } catch (error) {
    await updateTask(config, task.id, claimToken, "failed_retryable", "browser_execution_failed", {
      error: String(error?.message || error),
    }).catch(() => null);
    if (tabId) await chrome.tabs.update(tabId, { active: true }).catch(() => null);
  }
}

async function pollAutomationQueue() {
  if (running) return;
  running = true;
  try {
    const stored = await storedConfig();
    const config = stored.ivyRadarConfig;
    if (!config?.siteOrigin || !config?.accessKey) return;
    const queue = await apiRequest(config, "/api/application-automation/extension");
    if (!queue?.config?.enabled || !Array.isArray(queue.ready) || !queue.ready.length) return;
    await runTask(config, queue.ready[0], stored.ivyAutofillLanguage || queue.config.defaultLanguage || "en");
  } finally {
    running = false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(AUTOMATION_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
  void pollAutomationQueue();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(AUTOMATION_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
  void pollAutomationQueue();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTOMATION_ALARM) void pollAutomationQueue();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "IVY_RUN_AUTOMATION_NOW") return false;
  pollAutomationQueue()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});
