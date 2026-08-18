const status = document.getElementById("status");
const fillButton = document.getElementById("fill");
const importButton = document.getElementById("import");
const optionsButton = document.getElementById("options");

function show(message, tone = "") {
  status.textContent = message;
  status.dataset.tone = tone;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

fillButton.addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) return show("请先打开招聘申请页面。", "error");
    const stored = await chrome.storage.local.get(["ivyProfile"]);
    if (!stored.ivyProfile) return show("还没有申请资料。先打开“编辑资料”。", "error");
    await ensureContentScript(tab.id);
    const result = await chrome.tabs.sendMessage(tab.id, { type: "IVY_FILL_PAGE" });
    if (!result?.ok) return show(result?.error || "自动填写失败。", "error");
    const sensitive = result.skippedSensitive?.length ? "；敏感/EEO 项已跳过" : "";
    show(`${result.platform}: 已填写 ${result.filled} 个字段${sensitive}。`, result.filled ? "ok" : "warn");
  } catch (error) {
    show(`自动填写失败：${error.message || error}`, "error");
  }
});

importButton.addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) return show("请先打开 Ivy Job Radar 的 /autofill 页面。", "error");
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => localStorage.getItem("ivy_job_application_profile_v1"),
    });
    if (!result) return show("当前页面没有保存的 Job Radar 申请资料。", "error");
    const profile = JSON.parse(result);
    await chrome.storage.local.set({ ivyProfile: profile });
    show("已从当前 Job Radar 页面导入申请资料。", "ok");
  } catch (error) {
    show(`导入失败：${error.message || error}`, "error");
  }
});

optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
