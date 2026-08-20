(() => {
  if (window.__ivyGeneralEducationAutofillLoaded) return;
  window.__ivyGeneralEducationAutofillLoaded = true;

  const FORM_CONTROL_SELECTOR = 'input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select, [role="combobox"]';
  const PERIOD_RE = /起止时间|就读时间|学习时间|在校时间|教育时间|入学.*毕业|start\s*(?:date|time)?.*(?:end|graduat)|from.*to/i;

  function normalize(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s_\-/:*()\[\].,?]+/g, " ").trim();
  }

  function visible(el) {
    return Boolean(el && (el.offsetParent !== null || el.getClientRects().length));
  }

  function cleanShortText(value, max = 120) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text && text.length <= max ? text : "";
  }

  function nearbyLabelText(el) {
    const pieces = [
      el.getAttribute?.("name"),
      el.id,
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("placeholder"),
      el.getAttribute?.("data-testid"),
      el.getAttribute?.("data-test-id"),
      el.getAttribute?.("data-automation-id"),
    ];
    if (el.id) {
      const direct = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (direct) pieces.push(direct.textContent);
    }
    const ownLabel = el.closest?.("label");
    if (ownLabel) pieces.push(ownLabel.textContent);

    let cursor = el;
    for (let depth = 0; depth < 5 && cursor?.parentElement; depth += 1) {
      const parent = cursor.parentElement;
      let sibling = cursor.previousElementSibling;
      for (let step = 0; step < 2 && sibling; step += 1, sibling = sibling.previousElementSibling) {
        if (!sibling.matches?.(FORM_CONTROL_SELECTOR) && !sibling.querySelector?.(FORM_CONTROL_SELECTOR)) {
          const text = cleanShortText(sibling.textContent);
          if (text) pieces.push(text);
        }
      }
      for (const child of Array.from(parent.children || [])) {
        if (child === cursor || child.contains?.(cursor)) continue;
        const className = String(child.className || "");
        if (!/label|title|caption|name|header|field-name|form-item/i.test(className)) continue;
        const text = cleanShortText(child.textContent);
        if (text) pieces.push(text);
      }
      cursor = parent;
    }
    return normalize(pieces.filter(Boolean).join(" "));
  }

  function inferField(text) {
    if (!text) return "";
    const rules = [
      ["degreeType", /学历类型|培养类型|教育类型|degree category|education type/i],
      ["college", /学院|院系|department|faculty|school of|academic unit/i],
      ["researchUnit", /实验室|研究单位|研究中心|laboratory|\blab\b|research (?:unit|center|centre)/i],
      ["advisor", /导师|advisor|adviser|supervisor|mentor/i],
      ["gpaScale", /满分绩点|绩点满分|gpa scale|max(?:imum)? gpa|grade scale/i],
      ["gpa", /绩点|\bgpa\b/i],
      ["rank", /排名|年级排名|专业排名|class rank|ranking|percentile/i],
      ["researchArea", /研究领域|研究方向|research (?:area|field|interest|focus)/i],
      ["thesis", /毕业论文|学位论文|博士论文|硕士论文|thesis|dissertation/i],
      ["school", /学校名称|学校|大学|school|university|institution/i],
      ["degree", /(?<!类型)学历|学位|degree|qualification/i],
      ["major", /专业|major|field of study|discipline|program/i],
      ["startDate", /入学时间|入学日期|education start|school start|enrollment date/i],
      ["endDate", /毕业时间|毕业日期|education end|school end|graduation date/i],
    ];
    return rules.find(([, re]) => re.test(text))?.[0] || "";
  }

  function contextSignature(node) {
    if (!node) return "";
    const pieces = [node.innerText || node.textContent || ""];
    const controls = Array.from(node.querySelectorAll?.(FORM_CONTROL_SELECTOR) || []).slice(0, 20);
    for (const control of controls) {
      const value = control.value || control.getAttribute?.("value") || "";
      if (value) pieces.push(value);
      if (control instanceof HTMLSelectElement && control.selectedIndex >= 0) pieces.push(control.options[control.selectedIndex]?.textContent || "");
    }
    return normalize(pieces.join(" "));
  }

  function schoolVariants(entry) {
    return [entry?.school, entry?.school_zh]
      .map(normalize)
      .filter((value) => value.length >= 3);
  }

  function educationIndexFromContext(el, profile) {
    const entries = Array.isArray(profile?.education) ? profile.education : [];
    let node = el;
    for (let depth = 0; depth < 8 && node?.parentElement; depth += 1) {
      node = node.parentElement;
      const signature = contextSignature(node);
      const matches = entries
        .map((entry, index) => ({ index, variants: schoolVariants(entry) }))
        .filter(({ variants }) => variants.some((variant) => signature.includes(variant)));
      if (matches.length === 1) return matches[0].index;
    }
    return -1;
  }

  function groupedPeriodKey(el, labelText) {
    if (!PERIOD_RE.test(labelText)) return "";
    let node = el;
    for (let depth = 0; depth < 5 && node?.parentElement; depth += 1) {
      node = node.parentElement;
      const controls = Array.from(node.querySelectorAll?.(FORM_CONTROL_SELECTOR) || []).filter(visible);
      if (controls.length < 2 || controls.length > 4 || !controls.includes(el)) continue;
      const signature = normalize(node.innerText || node.textContent || "");
      if (!PERIOD_RE.test(`${labelText} ${signature}`)) continue;
      const index = controls.indexOf(el);
      if (index === 0) return "startDate";
      if (index === 1) return "endDate";
    }
    return "";
  }

  function chinesePage() {
    return /[\u4e00-\u9fff]/.test(document.body?.innerText?.slice(0, 3000) || "");
  }

  function localized(value) {
    const text = String(value || "").trim();
    if (!text.includes("/")) return text;
    const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
    return chinesePage() ? (parts[parts.length - 1] || text) : (parts[0] || text);
  }

  function yearOnlyControl(el, labelText) {
    const text = `${labelText} ${el.getAttribute?.("placeholder") || ""} ${el.getAttribute?.("aria-label") || ""}`;
    return (el.getAttribute?.("maxlength") === "4") || (/年|year/i.test(text) && !/月|month|yyyy[-/.]mm/i.test(text));
  }

  function educationValue(entry, key, el, labelText) {
    if (!entry) return "";
    const startMonth = String(entry.start_month || "").padStart(2, "0");
    const endMonth = String(entry.end_month || "").padStart(2, "0");
    const startFull = entry.start_year && entry.start_month ? `${entry.start_year}-${startMonth}` : "";
    const endFull = entry.end_year && entry.end_month ? `${entry.end_year}-${endMonth}` : "";
    const map = {
      school: localized(entry.school_zh || entry.school),
      college: localized(entry.college),
      degree: localized(entry.degree || entry.degree_en),
      degreeType: entry.degree_type || "",
      major: localized(entry.major),
      advisor: entry.advisor,
      researchUnit: entry.research_unit,
      gpa: entry.gpa,
      gpaScale: entry.gpa_scale,
      rank: entry.rank,
      researchArea: entry.research_area,
      thesis: entry.thesis,
      startDate: startFull || (yearOnlyControl(el, labelText) ? entry.start_year : ""),
      endDate: endFull || (yearOnlyControl(el, labelText) ? entry.end_year : ""),
    };
    return String(map[key] || "").trim();
  }

  function empty(el) {
    if (el instanceof HTMLInputElement && ["radio", "checkbox"].includes(el.type)) return !el.checked;
    return !String(el.value || "").trim();
  }

  function dispatch(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setText(el, value) {
    if (!value || el.disabled || el.readOnly) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    dispatch(el);
    return true;
  }

  function setSelect(el, value) {
    const wanted = normalize(value);
    const options = Array.from(el.options || []);
    let match = options.find((option) => normalize(option.value) === wanted || normalize(option.textContent) === wanted);
    if (!match) match = options.find((option) => normalize(option.textContent).includes(wanted) || wanted.includes(normalize(option.textContent)));
    if (!match) return false;
    el.value = match.value;
    dispatch(el);
    return true;
  }

  async function setCombobox(el, value) {
    if (!value || el.disabled || el.readOnly) return false;
    el.click();
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) setText(el, value);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const wanted = normalize(value);
    const options = Array.from(document.querySelectorAll('[role="option"], .select__option, [class*="option"]')).filter(visible);
    const match = options.find((option) => normalize(option.textContent) === wanted)
      || options.find((option) => normalize(option.textContent).includes(wanted) || wanted.includes(normalize(option.textContent)));
    if (match) {
      match.click();
      dispatch(el);
      return true;
    }
    return Boolean(el.value);
  }

  async function fillEducation(profile) {
    if (!profile || profile.schema_version !== "global-application-autofill-profile-v1" || !Array.isArray(profile.education)) {
      return { filled: 0, fields: [] };
    }
    const controls = Array.from(document.querySelectorAll(FORM_CONTROL_SELECTOR)).filter(visible);
    const fallbackCounters = new Map();
    let filled = 0;
    const fields = [];

    for (const el of controls) {
      if (!empty(el)) continue;
      const labelText = nearbyLabelText(el);
      let key = inferField(labelText);
      if (!key) key = groupedPeriodKey(el, labelText);
      if (!key) continue;

      let entryIndex = educationIndexFromContext(el, profile);
      if (entryIndex < 0) {
        const count = fallbackCounters.get(key) || 0;
        entryIndex = count;
        fallbackCounters.set(key, count + 1);
      }
      const entry = profile.education[entryIndex];
      const value = educationValue(entry, key, el, labelText);
      if (!value) continue;

      let changed = false;
      if (el instanceof HTMLSelectElement) changed = setSelect(el, value);
      else if (el.getAttribute?.("role") === "combobox" || el.getAttribute?.("aria-autocomplete")) changed = await setCombobox(el, value);
      else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) changed = setText(el, value);
      if (changed) {
        filled += 1;
        fields.push(`education.${key}`);
      }
    }
    return { filled, fields: [...new Set(fields)] };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "IVY_FILL_GENERAL_EDUCATION") return false;
    fillEducation(message.generalProfile || null)
      .then((payload) => sendResponse({ ok: true, ...payload }))
      .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
    return true;
  });
})();
