(() => {
  const SENSITIVE_RE = /(race|ethnic|gender|sex(?!ual)|veteran|disability|religion|marital|sexual orientation|pronoun|date of birth|birth date|ssn|social security|demographic|eeo|equal employment)/i;
  const SUBMIT_RE = /(submit|send application|complete application|apply now|finish application)/i;

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[\s_\-/:*()\[\].,?]+/g, " ").trim();
  }

  function fieldText(el) {
    const pieces = [el.name, el.id, el.getAttribute("aria-label"), el.getAttribute("placeholder"), el.getAttribute("data-automation-id")];
    if (el.id) {
      const direct = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (direct) pieces.push(direct.textContent);
    }
    const label = el.closest("label");
    if (label) pieces.push(label.textContent);
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) pieces.push(legend.textContent);
    }
    const group = el.closest('[role="group"], [data-automation-id*="formField"], .field, .application-field, .ashby-application-form-question');
    if (group) pieces.push(group.textContent);
    return normalize(pieces.filter(Boolean).join(" "));
  }

  function getProfileValue(profile, key) {
    const path = key.split(".");
    let value = profile;
    for (const part of path) value = value && value[part];
    return value == null ? "" : String(value).trim();
  }

  const RULES = [
    ["identity.firstName", /\b(first name|given name|forename)\b/],
    ["identity.middleName", /\b(middle name|middle initial)\b/],
    ["identity.lastName", /\b(last name|family name|surname)\b/],
    ["identity.preferredName", /\b(preferred name|chosen name|nickname)\b/],
    ["identity.email", /\b(e mail|email address|email)\b/],
    ["identity.phone", /\b(phone|mobile|telephone|cell)\b/],
    ["location.city", /\b(city|town)\b/],
    ["location.state", /\b(state|province|region)\b/],
    ["location.country", /\b(country|country of residence)\b/],
    ["links.linkedin", /\blinked\s*in\b/],
    ["links.github", /\bgithub\b/],
    ["links.website", /\b(personal website|portfolio|website|homepage)\b/],
    ["education.school", /\b(school|university|college|institution)\b/],
    ["education.degree", /\b(degree|degree type|qualification)\b/],
    ["education.major", /\b(field of study|major|discipline|program)\b/],
    ["education.graduationMonth", /\b(graduation month|graduate month|end month)\b/],
    ["education.graduationYear", /\b(graduation year|graduate year|end year)\b/],
    ["eligibility.workAuthorizationUS", /\b(authorized|authorised|legally authorized|legally authorised).*\b(work|employment).*\b(united states|u s|usa)\b|\bwork authorization\b/],
    ["eligibility.sponsorshipUS", /\b(sponsor|sponsorship|visa sponsorship|immigration sponsorship)\b/],
    ["eligibility.relocation", /\b(relocat|willing to move|willingness to relocate)\b/]
  ];

  function inferKey(text) {
    if (!text || SENSITIVE_RE.test(text)) return null;
    for (const [key, re] of RULES) if (re.test(text)) return key;
    return null;
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
    if (!value || el.disabled) return false;
    const wanted = normalize(value);
    const options = Array.from(el.options || []);
    let match = options.find((option) => normalize(option.value) === wanted || normalize(option.textContent) === wanted);
    if (!match) match = options.find((option) => normalize(option.textContent).includes(wanted) || wanted.includes(normalize(option.textContent)));
    if (!match) return false;
    el.value = match.value;
    dispatch(el);
    return true;
  }

  function choiceLabel(el) {
    const pieces = [el.value, el.getAttribute("aria-label")];
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label) pieces.push(label.textContent);
    }
    const parent = el.closest("label");
    if (parent) pieces.push(parent.textContent);
    return normalize(pieces.filter(Boolean).join(" "));
  }

  function yesNo(value) {
    const normalized = normalize(value);
    if (["yes", "y", "true", "1"].includes(normalized)) return "yes";
    if (["no", "n", "false", "0"].includes(normalized)) return "no";
    return "";
  }

  function setRadio(el, value) {
    const target = yesNo(value);
    if (!target || el.disabled) return false;
    const label = choiceLabel(el);
    const isTarget = target === "yes" ? /\b(yes|true)\b/.test(label) : /\b(no|false)\b/.test(label);
    if (!isTarget) return false;
    el.click();
    dispatch(el);
    return true;
  }

  function fill(profile) {
    const elements = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]), textarea, select'));
    let filled = 0;
    const fields = [];
    const skippedSensitive = [];

    for (const el of elements) {
      const text = fieldText(el);
      if (!text) continue;
      if (SENSITIVE_RE.test(text)) {
        skippedSensitive.push(text.slice(0, 120));
        continue;
      }
      if (SUBMIT_RE.test(text) && (el.type === "submit" || el.type === "button")) continue;
      const key = inferKey(text);
      if (!key) continue;
      const value = getProfileValue(profile, key);
      if (!value) continue;

      let changed = false;
      if (el instanceof HTMLSelectElement) changed = setSelect(el, value);
      else if (el instanceof HTMLInputElement && el.type === "radio") changed = setRadio(el, value);
      else if (el instanceof HTMLInputElement && el.type === "checkbox") changed = false;
      else changed = setText(el, value);

      if (changed) {
        filled += 1;
        fields.push(key);
      }
    }

    return { filled, fields: [...new Set(fields)], skippedSensitive: [...new Set(skippedSensitive)].slice(0, 10), platform: detectPlatform() };
  }

  function detectPlatform() {
    const host = location.hostname.toLowerCase();
    const body = normalize(document.body?.innerText?.slice(0, 4000));
    if (host.includes("greenhouse") || body.includes("greenhouse")) return "Greenhouse";
    if (host.includes("lever.co") || body.includes("lever")) return "Lever";
    if (host.includes("ashbyhq") || body.includes("ashby")) return "Ashby";
    if (host.includes("myworkdayjobs") || host.includes("workday") || body.includes("workday")) return "Workday";
    return "Generic ATS";
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "IVY_FILL_PAGE") return;
    chrome.storage.local.get(["ivyProfile"], (result) => {
      try {
        sendResponse({ ok: true, ...fill(result.ivyProfile || {}) });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
    });
    return true;
  });
})();
