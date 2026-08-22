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

  function directLabelText(el) {
    const pieces = [
      el.getAttribute?.("name"), el.id, el.getAttribute?.("aria-label"),
      el.getAttribute?.("placeholder"), el.getAttribute?.("data-testid"),
      el.getAttribute?.("data-test-id"), el.getAttribute?.("data-automation-id"),
    ];
    if (el.id) {
      const direct = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (direct) pieces.push(direct.textContent);
    }
    const ownLabel = el.closest?.("label");
    if (ownLabel) pieces.push(ownLabel.textContent);
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

  function schoolAnchorBlock(anchor) {
    let node = anchor;
    for (let depth = 0; depth < 14 && node?.parentElement; depth += 1) {
      node = node.parentElement;
      if (node === document.body) break;
      const controls = Array.from(node.querySelectorAll?.(FORM_CONTROL_SELECTOR) || []).filter(visible);
      if (!controls.includes(anchor) || controls.length < 4 || controls.length > 32) continue;
      const schools = controls.filter((control) => inferField(directLabelText(control)) === "school");
      const educationKeys = new Set(controls.map((control) => inferField(directLabelText(control)) || inferField(nearbyLabelText(control))).filter(Boolean));
      if (schools.length === 1 && educationKeys.size >= 3) return node;
    }
    return null;
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

  function dispatch(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setText(el, value) {
    if (!value || el.disabled) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    dispatch(el);
    return true;
  }

  function dateLikeField(el) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
    if (["date", "month"].includes(String(el.type || "").toLowerCase())) return true;
    const hint = normalize([
      el.getAttribute?.("placeholder"),
      el.getAttribute?.("aria-label"),
      el.getAttribute?.("name"),
      el.id,
    ].filter(Boolean).join(" "));
    return /yyyy|year|month|年|月|日期|date|开始时间|结束时间|开始日期|结束日期/.test(hint);
  }

  function educationRank(entry) {
    const text = normalize([entry?.degree_type, entry?.degree, entry?.degree_en].filter(Boolean).join(" "));
    if (/博士|doctor|ph d/.test(text)) return 0;
    if (/硕士|master|m s/.test(text)) return 1;
    if (/学士|本科|bachelor|b s/.test(text)) return 2;
    return 9;
  }

  function orderedEducationEntries(profile) {
    return (profile.education || []).map((entry, index) => ({ entry, index }))
      .sort((a, b) => educationRank(a.entry) - educationRank(b.entry) || a.index - b.index)
      .map(({ entry }) => entry);
  }

  function orderedEducationBlocks(controls) {
    const blocks = [];
    const seen = new Set();
    const schoolAnchors = controls.filter((control) => inferField(directLabelText(control)) === "school");
    for (const control of schoolAnchors) {
      const block = schoolAnchorBlock(control);
      if (!block || seen.has(block)) continue;
      seen.add(block);
      blocks.push({ block, firstControlIndex: controls.findIndex((item) => Array.from(block.querySelectorAll?.(FORM_CONTROL_SELECTOR) || []).includes(item)) });
    }
    return blocks.sort((a, b) => a.firstControlIndex - b.firstControlIndex).map(({ block }) => block);
  }

  function dateParts(value) {
    const match = String(value || "").match(/((?:19|20)\d{2})(?:\D+(0?[1-9]|1[0-2]))?(?:\D+(3[01]|[0-2]?\d))?/);
    return match ? {
      year: match[1],
      month: match[2] ? String(match[2]).padStart(2, "0") : "",
      day: match[3] ? String(match[3]).padStart(2, "0") : "",
    } : { year: "", month: "", day: "" };
  }

  function lastDay(year, month) {
    return String(new Date(Number(year), Number(month), 0).getDate()).padStart(2, "0");
  }

  function dateCandidates(el, value, role) {
    const parts = dateParts(value);
    if (!parts.year) return [];
    const month = parts.month || "01";
    const day = parts.day || (role === "end" ? lastDay(parts.year, month) : "01");
    const raw = [el.type, el.getAttribute?.("placeholder"), el.getAttribute?.("aria-label")].filter(Boolean).join(" ").toLowerCase();
    const dayControl = String(el.type || "").toLowerCase() === "date" || /yyyy.*mm.*dd|年月日|选择日期|开始日期|结束日期/.test(raw);
    const monthControl = String(el.type || "").toLowerCase() === "month" || /yyyy.*mm|年月|月份/.test(raw);
    const formats = dayControl ? [`${parts.year}-${month}-${day}`, `${parts.year}-${month}`, parts.year]
      : monthControl ? [`${parts.year}-${month}`, `${parts.year}-${month}-${day}`, parts.year]
        : [`${parts.year}-${month}`, `${parts.year}-${month}-${day}`, parts.year];
    return [...new Set(formats)];
  }

  function acceptedDate(el, candidate) {
    const actual = dateParts(el.value || el.getAttribute?.("value") || "");
    const expected = dateParts(candidate);
    return Boolean(actual.year && actual.year === expected.year && (!expected.month || actual.month === expected.month) && (!expected.day || !actual.day || actual.day === expected.day));
  }

  function isoDayShift(value, delta) {
    const parts = dateParts(value);
    if (!parts.year || !parts.month || !parts.day) return "";
    const shifted = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + delta));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
  }

  function isoDayDifference(actual, expected) {
    const actualParts = dateParts(actual);
    const expectedParts = dateParts(expected);
    if (!actualParts.day || !expectedParts.day) return null;
    const actualMs = Date.UTC(Number(actualParts.year), Number(actualParts.month) - 1, Number(actualParts.day));
    const expectedMs = Date.UTC(Number(expectedParts.year), Number(expectedParts.month) - 1, Number(expectedParts.day));
    return Math.round((actualMs - expectedMs) / 86400000);
  }

  async function setAdaptiveDate(el, value, role) {
    if (!value || el.disabled) return false;
    const wasReadOnly = Boolean(el.readOnly);
    const hadReadOnly = Boolean(el.hasAttribute?.("readonly"));
    for (const candidate of dateCandidates(el, value, role)) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (wasReadOnly) {
          el.readOnly = false;
          el.removeAttribute?.("readonly");
        }
        el.focus?.({ preventScroll: true });
        setText(el, candidate);
        if (attempt === 2) {
          try { el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })); } catch {}
        }
        el.blur?.();
        await new Promise((resolve) => setTimeout(resolve, attempt === 2 ? 140 : 45));
        if (acceptedDate(el, candidate)) {
          if (wasReadOnly) el.readOnly = true;
          if (hadReadOnly) el.setAttribute?.("readonly", "");
          return true;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
          const actual = String(el.value || el.getAttribute?.("value") || "");
          const difference = isoDayDifference(actual, candidate);
          if (difference === -1 || difference === 1) {
            setText(el, isoDayShift(candidate, -difference));
            el.blur?.();
            await new Promise((resolve) => setTimeout(resolve, 45));
            if (acceptedDate(el, candidate)) {
              if (wasReadOnly) el.readOnly = true;
              if (hadReadOnly) el.setAttribute?.("readonly", "");
              return true;
            }
          }
        }
      }
    }
    if (wasReadOnly) el.readOnly = true;
    if (hadReadOnly) el.setAttribute?.("readonly", "");
    return false;
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

  function clearControl(el) {
    if (!el || el.disabled || !String(el.value || "").trim()) return false;
    const wasReadOnly = Boolean(el.readOnly);
    if (wasReadOnly) {
      el.readOnly = false;
      el.removeAttribute?.("readonly");
    }
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, ""); else el.value = "";
    el.setAttribute?.("value", "");
    dispatch(el);
    if (wasReadOnly) {
      el.readOnly = true;
      el.setAttribute?.("readonly", "");
    }
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
    let filled = 0;
    const fields = [];
    const entries = orderedEducationEntries(profile);
    const blocks = orderedEducationBlocks(controls);
    const usedControls = new Set();

    for (let blockIndex = 0; blockIndex < blocks.length && blockIndex < entries.length; blockIndex += 1) {
      const block = blocks[blockIndex];
      const entry = entries[blockIndex];
      const blockControls = Array.from(block.querySelectorAll?.(FORM_CONTROL_SELECTOR) || []).filter(visible);
      for (const el of blockControls) {
        if (usedControls.has(el)) continue;
        const directText = directLabelText(el);
        const labelText = nearbyLabelText(el);
        let key = inferField(directText) || inferField(labelText);
        if (!key) key = groupedPeriodKey(el, labelText);
        if (!key && dateLikeField(el)) {
          const dates = blockControls.filter(dateLikeField);
          key = dates.indexOf(el) === 0 ? "startDate" : dates.indexOf(el) === 1 ? "endDate" : "";
        }
        if (!key) continue;
        const value = educationValue(entry, key, el, labelText);
        if (!value) {
          if ((key === "startDate" || key === "endDate") && clearControl(el)) {
            usedControls.add(el);
            filled += 1;
            fields.push(`education.${key}.clearedUnverified`);
          }
          continue;
        }

        let changed = false;
        if (key === "startDate") changed = await setAdaptiveDate(el, value, "start");
        else if (key === "endDate") changed = await setAdaptiveDate(el, value, "end");
        else if (el instanceof HTMLSelectElement) changed = setSelect(el, value);
        else if (el.getAttribute?.("role") === "combobox" || el.getAttribute?.("aria-autocomplete")) changed = await setCombobox(el, value);
        else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) changed = setText(el, value);
        if (changed) {
          usedControls.add(el);
          filled += 1;
          fields.push(`education.${key}`);
        }
      }
    }
    if (blocks.length) fields.push("education.periodBySlot");
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
