(() => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function populateSubmittedFallback() {
    // Give the normal automatic matcher a moment to finish first.
    await delay(500);

    const wrap = document.getElementById("candidateWrap");
    const select = document.getElementById("candidate");
    const context = document.getElementById("context");
    if (!wrap || !select || !context) return;

    // If automatic/manual matching already selected a job or supplied candidates, do nothing.
    if (context.dataset.matched === "true") return;
    if (!wrap.classList.contains("hidden") || select.options.length > 0) return;

    const { ivyRadarConfig } = await chrome.storage.local.get(["ivyRadarConfig"]);
    if (!ivyRadarConfig?.siteOrigin || !ivyRadarConfig?.accessKey) return;

    try {
      const endpoint = new URL("/api/autofill/application-context", ivyRadarConfig.siteOrigin);
      // Empty jobUrl intentionally asks the server for the submitted-application pool
      // instead of filtering by the current recruiting-page host.
      endpoint.searchParams.set("jobUrl", "");
      const response = await fetch(endpoint, {
        cache: "no-store",
        headers: { "X-Ivy-Autofill-Key": ivyRadarConfig.accessKey },
      });
      if (!response.ok) return;
      const result = await response.json().catch(() => ({}));
      const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
      if (!candidates.length) return;

      select.replaceChildren();
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "请选择已提交申请…";
      select.append(blank);

      for (const candidate of candidates) {
        const option = document.createElement("option");
        option.value = String(candidate.id);
        const location = candidate.location ? ` · ${candidate.location}` : "";
        const appId = candidate.applicationId ? ` · ${candidate.applicationId}` : "";
        option.textContent = `${candidate.company} · ${candidate.title}${location}${appId}`;
        select.append(option);
      }

      wrap.classList.remove("hidden");
      context.replaceChildren();
      context.dataset.matched = "false";
      const strong = document.createElement("strong");
      strong.textContent = "没有自动匹配到；请手动选择";
      const span = document.createElement("span");
      span.textContent = "已加载你的已提交申请。请选择当前岗位，然后再填写申请页。";
      context.append(strong, span);
      context.dataset.tone = "warn";
    } catch {
      // Keep the normal popup usable even if the fallback request fails.
    }
  }

  void populateSubmittedFallback();
})();
