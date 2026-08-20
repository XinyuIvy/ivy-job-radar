(() => {
  const fillButton = document.getElementById("fill");
  const status = document.getElementById("status");
  if (!fillButton || !status) return;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForPrimaryFill() {
    for (let attempt = 0; attempt < 70; attempt += 1) {
      const text = String(status.textContent || "");
      if (/已写入\s*\d+\s*个表单控件/.test(text)) return true;
      if (/自动填写失败|请先打开招聘申请页面|还没有本地基础申请资料/.test(text)) return false;
      await sleep(100);
    }
    return false;
  }

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function fetchGlobalProfile(config) {
    if (!config?.siteOrigin || !config?.accessKey) return null;
    const origins = [`${new URL(config.siteOrigin).origin}/*`];
    if (!await chrome.permissions.contains({ origins })) return null;
    const endpoint = new URL("/api/autofill/general-profile", config.siteOrigin);
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { "X-Ivy-Autofill-Key": config.accessKey },
    });
    if (!response.ok) return null;
    const result = await response.json().catch(() => ({}));
    return result.profile || null;
  }

  fillButton.addEventListener("click", () => {
    void (async () => {
      if (!await waitForPrimaryFill()) return;
      const tab = await activeTab();
      if (!tab?.id || !/^https?:/i.test(tab.url || "")) return;
      const stored = await chrome.storage.local.get(["ivyRadarConfig"]);
      const generalProfile = await fetchGlobalProfile(stored.ivyRadarConfig).catch(() => null);
      if (!generalProfile) return;

      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["education-autofill.js"] });
        const result = await chrome.tabs.sendMessage(tab.id, {
          type: "IVY_FILL_GENERAL_EDUCATION",
          generalProfile,
        });
        if (!result?.ok || !result.filled) return;
        const current = String(status.textContent || "").replace(/。\s*$/, "");
        status.textContent = `${current}；通用教育补填 ${result.filled} 个字段。`;
      } catch {
        // The primary autofill remains usable even if the supplemental education pass cannot run.
      }
    })();
  });
})();
