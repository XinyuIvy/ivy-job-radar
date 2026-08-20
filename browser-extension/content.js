(() => {
  if (window.__ivyJobAutofillLoaded) return;
  window.__ivyJobAutofillLoaded = true;

  const SENSITIVE_RE = /(race|ethnic|gender|sex(?!ual)|veteran|disability|religion|marital|sexual orientation|pronoun|date of birth|birth date|ssn|social security|demographic|eeo|equal employment|种族|族裔|性别|残障|退伍|宗教|出生日期|社会安全号)/i;
  const SUBMIT_RE = /(submit|send application|complete application|apply now|finish application|提交申请|完成申请)/i;
  const RESUME_RE = /\b(resume|résumé|cv|curriculum vitae)\b|简历/i;
  const NON_RESUME_FILE_RE = /(cover letter|portfolio|transcript|writing sample|certificate|photo|头像|成绩单|作品集)/i;
  const OPEN_QUESTION_RE = /(why|motivat|interest|describe|tell us|additional information|anything else|experience with|what excites|why this|cover letter|statement|请描述|为什么|动机|补充信息|相关经验)/i;
  const MONTH_NAMES = {
    "01": ["jan", "january"], "02": ["feb", "february"], "03": ["mar", "march"], "04": ["apr", "april"],
    "05": ["may"], "06": ["jun", "june"], "07": ["jul", "july"], "08": ["aug", "august"],
    "09": ["sep", "sept", "september"], "10": ["oct", "october"], "11": ["nov", "november"], "12": ["dec", "december"],
  };

  function normalize(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s_\-/:*()\[\].,?]+/g, " ").trim();
  }

  function textFromId(id) {
    if (!id) return "";
    return String(document.getElementById(id)?.textContent || "").trim();
  }

  function fieldText(el) {
    const pieces = [
      el.name,
      el.id,
      el.getAttribute("aria-label"),
      el.getAttribute("placeholder"),
      el.getAttribute("data-automation-id"),
      el.getAttribute("data-testid"),
      el.getAttribute("data-test-id"),
    ];
    const labelledBy = String(el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    for (const id of labelledBy) pieces.push(textFromId(id));
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
    const group = el.closest('[role="group"], [data-automation-id*="formField"], [data-automation-id*="question"], .field, .application-field, .ashby-application-form-question');
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
    ["identity.firstName", /\b(first name|given name|forename)\b|名字/],
    ["identity.middleName", /\b(middle name|middle initial)\b/],
    ["identity.lastName", /\b(last name|family name|surname)\b|姓氏/],
    ["identity.preferredName", /\b(preferred name|chosen name|nickname)\b/],
    ["identity.email", /\b(e mail|email address|email)\b|邮箱/],
    ["identity.phone", /\b(phone|mobile|telephone|cell)\b|手机|电话/],
    ["location.address2", /\b(address line 2|address 2|apt|apartment|suite|unit)\b/],
    ["location.address1", /\b(street address|address line 1|address 1|mailing address|home address)\b/],
    ["location.postalCode", /\b(zip|zip code|postal|postal code)\b|邮编/],
    ["location.city", /\b(city|town)\b|城市/],
    ["location.state", /\b(state|province|region)\b|州|省份/],
    ["location.country", /\b(country|country of residence)\b|国家/],
    ["links.linkedin", /\blinked\s*in\b/],
    ["links.github", /\bgithub\b/],
    ["links.website", /\b(personal website|portfolio url|website|homepage)\b|个人网站/],

    ["education.degreeType", /\b(education type|degree category)\b|学历类型/],
    ["education.school", /\b(school|university|institution)\b|学校名称|学校|大学/],
    ["education.college", /\b(department|faculty|school of|academic unit)\b|学院|院系/],
    ["education.degree", /\b(degree|qualification)\b|(?<!类型)学历|学位/],
    ["education.major", /\b(field of study|major|discipline|program)\b|专业/],
    ["education.advisor", /\b(advisor|adviser|supervisor|mentor)\b|导师/],
    ["education.researchUnit", /\b(research unit|research center|research centre|laboratory|lab)\b|研究单位|研究中心|实验室/],
    ["education.gpaScale", /\b(gpa scale|max(?:imum)? gpa|grade scale)\b|满分绩点|绩点满分/],
    ["education.gpa", /\bgpa\b|绩点/],
    ["education.rank", /\b(class rank|ranking|percentile)\b|排名|前\s*\d+\s*%/],
    ["education.researchArea", /\b(research area|research field|research interest|research focus)\b|研究领域|研究方向/],
    ["education.thesis", /\b(thesis|dissertation)\b|毕业论文|学位论文|博士论文|硕士论文/],
    ["education.publications", /(?:education|academic|教育|在校).*(?:publication|paper|论文)|(?:publication|paper|论文).*(?:education|academic|教育|在校)/],
    ["education.startMonth", /\b(education start month|school start month|enrollment month)\b|入学月份/],
    ["education.startYear", /\b(education start year|school start year|enrollment year)\b|入学年份/],
    ["education.endMonth", /\b(education end month|school end month|graduation month|graduate month)\b|毕业月份/],
    ["education.endYear", /\b(education end year|school end year|graduation year|graduate year)\b|毕业年份/],
    ["education.startDate", /\b(education start date|school start date|enrollment date)\b|入学时间/],
    ["education.endDate", /\b(education end date|school end date|graduation date)\b|毕业时间/],
    ["education.graduationMonth", /\b(graduation month|graduate month|education end month)\b/],
    ["education.graduationYear", /\b(graduation year|graduate year|education end year)\b/],

    ["employment.description", /\b(job description|role description|description of duties|job duties|work responsibilities)\b|工作职责|工作内容|岗位职责/],
    ["employment.employer", /\b(current employer|employer|company name|organization name)\b|雇主|公司名称/],
    ["employment.title", /\b(current title|job title|position title|role title)\b|职位名称|职位/],
    ["employment.location", /\b(employment location|work location)\b/],
    ["employment.startMonth", /\b(employment start month|job start month)\b/],
    ["employment.startYear", /\b(employment start year|job start year)\b/],
    ["employment.endMonth", /\b(employment end month|job end month)\b/],
    ["employment.endYear", /\b(employment end year|job end year)\b/],

    ["project.url", /\b(project url|project link|project website|repository url|repo url|project address)\b|项目链接|项目地址|项目网址|项目url/],
    ["project.description", /\b(project description|project summary|research description)\b|项目描述|项目简介|研究描述/],
    ["project.name", /\b(project name|project title|research project title)\b|项目名称|项目标题/],
    ["project.role", /\b(project role|research role|role in project|project contribution)\b|项目角色|项目职责/],
    ["cv.skills", /\b(technical skills|key skills|skills)\b|专业技能|技能清单/],
    ["cv.publications", /\b(selected publications|publications|publication list)\b|论文列表|代表论文/],
    ["eligibility.age18", /\b(at least|over)\s*18|18 years old|age of 18\b/],
    ["eligibility.workAuthorizationUS", /\b(authorized|authorised|legally authorized|legally authorised).*\b(work|employment).*\b(united states|u s|usa)\b|\bwork authorization\b/],
    ["eligibility.sponsorshipUS", /\b(sponsor|sponsorship|visa sponsorship|immigration sponsorship)\b/],
    ["eligibility.relocation", /\b(relocat|willing to move|willingness to relocate)\b/],
    ["eligibility.remoteWork", /\b(remote work|work remotely|remote position)\b/],
    ["application.availableStartDate", /\b(available start|available to start|earliest start|start date availability)\b/],
    ["application.salaryExpectation", /\b(salary expectation|expected salary|desired salary|compensation expectation)\b/],
    ["application.hearAboutUs", /\b(how did you hear|how did you find|source of application)\b/]
  ];

  function inferKey(text) {
    if (!text || SENSITIVE_RE.test(text)) return null;
    for (const [key, re] of RULES) if (re.test(text)) return key;
    return null;
  }

  function packetIsAuthoritative(packet) {
    return Boolean(packet && packet.authority === "final_customized_cv_only" && /^APP-\d{4}-/i.test(String(packet.application_id || "")));
  }

  function globalProfileIsAuthoritative(profile) {
    return Boolean(profile && profile.schema_version === "global-application-autofill-profile-v1" && Array.isArray(profile.education));
  }

  function deriveMajor(degree) {
    const value = String(degree || "").trim();
    if (!value) return "";
    const english = value.match(/\b(?:ph\.?d\.?|doctor(?:ate)?|m\.?s\.?|master(?:'s)?|b\.?s\.?|bachelor(?:'s)?)\s+(?:in|of)\s+(.+)/i);
    if (english) return english[1].trim();
    return value.replace(/博士|硕士|学士|博士学位|硕士学位|学士学位/g, "").trim();
  }

  function nextIndex(counters, group, key) {
    const counterKey = `${group}:${key}`;
    const index = counters.get(counterKey) || 0;
    counters.set(counterKey, index + 1);
    return index;
  }

  function projectUrl(entry) {
    if (entry?.url) return String(entry.url).trim();
    const links = Array.isArray(entry?.links) ? entry.links : [];
    const first = links.find((link) => link && typeof link.url === "string" && link.url.trim());
    return first ? first.url.trim() : "";
  }

  function packetEntryValue(packet, key, counters) {
    if (!packetIsAuthoritative(packet)) return { handled: false, value: "" };

    if (key.startsWith("education.")) {
      const entries = Array.isArray(packet.education) ? packet.education : [];
      const index = nextIndex(counters, "education", key);
      const entry = entries[index];
      if (!entry) return { handled: true, value: "" };
      const map = {
        "education.school": entry.school,
        "education.degree": entry.degree,
        "education.major": entry.major || deriveMajor(entry.degree),
        "education.graduationMonth": entry.end_month || entry.start_month,
        "education.graduationYear": entry.end_year || entry.start_year,
      };
      if (!(key in map)) return { handled: false, value: "" };
      return { handled: true, value: String(map[key] || "").trim() };
    }

    if (key.startsWith("employment.")) {
      const entries = Array.isArray(packet.experience) ? packet.experience : [];
      const index = nextIndex(counters, "experience", key);
      const entry = entries[index];
      if (!entry) return { handled: true, value: "" };
      const map = {
        "employment.employer": entry.organization,
        "employment.title": entry.title,
        "employment.location": entry.location,
        "employment.startMonth": entry.start_month,
        "employment.startYear": entry.start_year,
        "employment.endMonth": entry.end_month,
        "employment.endYear": entry.end_year,
        "employment.description": Array.isArray(entry.bullets) ? entry.bullets.join("\n") : "",
      };
      return { handled: true, value: String(map[key] || "").trim() };
    }

    if (key.startsWith("project.")) {
      const entries = Array.isArray(packet.projects) ? packet.projects : [];
      const index = nextIndex(counters, "projects", key);
      const entry = entries[index];
      if (!entry) return { handled: true, value: "" };
      const map = {
        "project.name": entry.name,
        "project.role": entry.role,
        "project.description": Array.isArray(entry.bullets) ? entry.bullets.join("\n") : "",
        "project.url": projectUrl(entry),
      };
      return { handled: true, value: String(map[key] || "").trim() };
    }

    if (key === "cv.skills") {
      const categories = Array.isArray(packet.skills) ? packet.skills : [];
      const items = categories.flatMap((category) => Array.isArray(category.items) ? category.items : []);
      return { handled: true, value: [...new Set(items)].join(", ") };
    }

    if (key === "cv.publications") {
      const publications = Array.isArray(packet.publications) ? packet.publications : [];
      return { handled: true, value: publications.join("\n") };
    }

    return { handled: false, value: "" };
  }

  function globalEducationValue(generalProfile, key, counters) {
    if (!globalProfileIsAuthoritative(generalProfile) || !key.startsWith("education.")) return { handled: false, value: "" };
    const entries = generalProfile.education;
    const index = nextIndex(counters, "education", key);
    const entry = entries[index];
    if (!entry) return { handled: true, value: "" };

    const startMonth = String(entry.start_month || "").padStart(2, "0");
    const endMonth = String(entry.end_month || "").padStart(2, "0");
    const startDate = entry.start_year && entry.start_month ? `${entry.start_year}-${startMonth}` : "";
    const endDate = entry.end_year && entry.end_month ? `${entry.end_year}-${endMonth}` : "";
    const publications = Array.isArray(entry.publications) ? entry.publications.join("\n") : "";
    const map = {
      "education.school": entry.school || entry.school_zh,
      "education.college": entry.college,
      "education.degree": entry.degree || entry.degree_en,
      "education.degreeType": entry.degree_type,
      "education.major": entry.major,
      "education.advisor": entry.advisor,
      "education.researchUnit": entry.research_unit,
      "education.gpa": entry.gpa,
      "education.gpaScale": entry.gpa_scale,
      "education.rank": entry.rank,
      "education.researchArea": entry.research_area,
      "education.thesis": entry.thesis,
      "education.publications": publications,
      "education.startMonth": entry.start_month,
      "education.startYear": entry.start_year,
      "education.endMonth": entry.end_month,
      "education.endYear": entry.end_year,
      "education.startDate": startDate,
      "education.endDate": endDate,
      "education.graduationMonth": entry.end_month,
      "education.graduationYear": entry.end_year,
    };
    if (!(key in map)) return { handled: false, value: "" };
    return { handled: true, value: String(map[key] || "").trim() };
  }

  function resolveValue(profile, generalProfile, packet, key, packetCounters, globalCounters) {
    if (key.startsWith("education.")) {
      const globalValue = globalEducationValue(generalProfile, key, globalCounters);
      if (globalValue.handled && globalValue.value) return globalValue.value;
      const packetValue = packetEntryValue(packet, key, packetCounters);
      if (packetValue.handled) return packetValue.value;
      if (globalValue.handled) return "";
      return getProfileValue(profile, key);
    }

    const packetValue = packetEntryValue(packet, key, packetCounters);
    if (packetValue.handled) return packetValue.value;
    return getProfileValue(profile, key);
  }

  function dispatch(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setText(el, value) {
    if (!value || el.disabled || el.readOnly) return false;
    if (el instanceof HTMLInputElement && el.type === "date" && /^\d{4}-\d{2}$/.test(value)) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    dispatch(el);
    return true;
  }

  function monthEquivalent(optionText, wanted) {
    const numeric = String(wanted || "").padStart(2, "0");
    const aliases = MONTH_NAMES[numeric];
    if (!aliases) return false;
    const option = normalize(optionText);
    return aliases.some((alias) => option === alias || option.startsWith(`${alias} `) || option.includes(` ${alias}`));
  }

  function setSelect(el, value) {
    if (!value || el.disabled) return false;
    const wanted = normalize(value);
    const options = Array.from(el.options || []);
    let match = options.find((option) => normalize(option.value) === wanted || normalize(option.textContent) === wanted);
    if (!match) match = options.find((option) => monthEquivalent(option.textContent, value));
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
    const isTarget = target === "yes" ? /\b(yes|true)\b|是/.test(label) : /\b(no|false)\b|否/.test(label);
    if (!isTarget) return false;
    el.click();
    dispatch(el);
    return true;
  }

  function visible(el) {
    return Boolean(el && (el.offsetParent !== null || el.getClientRects().length));
  }

  async function setCombobox(el, value) {
    if (!value || el.disabled || el.readOnly) return false;
    el.click();
    setText(el, value);
    await new Promise((resolve) => setTimeout(resolve, 90));
    const wanted = normalize(value);
    const options = Array.from(document.querySelectorAll('[role="option"], [data-automation-id="promptOption"], .select__option'))
      .filter(visible);
    let match = options.find((option) => normalize(option.textContent) === wanted);
    if (!match) match = options.find((option) => monthEquivalent(option.textContent, value));
    if (!match) match = options.find((option) => normalize(option.textContent).includes(wanted) || wanted.includes(normalize(option.textContent)));
    if (match) {
      match.click();
      dispatch(el);
      return true;
    }
    return true;
  }

  function isEmpty(el) {
    if (el instanceof HTMLInputElement && ["radio", "checkbox"].includes(el.type)) {
      if (!el.name) return !el.checked;
      return !document.querySelector(`input[name="${CSS.escape(el.name)}"]:checked`);
    }
    return !String(el.value || "").trim();
  }

  function unresolvedQuestions() {
    const elements = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]), textarea, select'));
    const questions = [];
    const seen = new Set();
    for (const el of elements) {
      if (!visible(el) || !isEmpty(el)) continue;
      const text = fieldText(el);
      if (!text || SENSITIVE_RE.test(text) || SUBMIT_RE.test(text) || inferKey(text)) continue;
      const worthSurfacing = el instanceof HTMLTextAreaElement || el.required || OPEN_QUESTION_RE.test(text);
      if (!worthSurfacing) continue;
      const clean = text.replace(/\s+/g, " ").slice(0, 240);
      if (clean.length < 4 || seen.has(clean)) continue;
      seen.add(clean);
      questions.push(clean);
      if (questions.length >= 12) break;
    }
    return questions;
  }

  async function fill(profile, generalProfile = null, applicationPacket = null) {
    const elements = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select'));
    let filled = 0;
    const fields = [];
    const skippedSensitive = [];
    const packetCounters = new Map();
    const globalCounters = new Map();

    for (const el of elements) {
      const text = fieldText(el);
      if (!text) continue;
      if (SENSITIVE_RE.test(text)) {
        skippedSensitive.push(text.slice(0, 120));
        continue;
      }
      const key = inferKey(text);
      if (!key) continue;
      const value = resolveValue(profile, generalProfile, applicationPacket, key, packetCounters, globalCounters);
      if (!value) continue;

      let changed = false;
      if (el instanceof HTMLSelectElement) changed = setSelect(el, value);
      else if (el instanceof HTMLInputElement && el.type === "radio") changed = setRadio(el, value);
      else if (el instanceof HTMLInputElement && el.type === "checkbox") changed = false;
      else if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete")) changed = await setCombobox(el, value);
      else changed = setText(el, value);

      if (changed) {
        filled += 1;
        fields.push(key);
      }
    }

    return {
      filled,
      fields: [...new Set(fields)],
      applicationSpecific: packetIsAuthoritative(applicationPacket),
      applicationId: packetIsAuthoritative(applicationPacket) ? applicationPacket.application_id : "",
      globalProfile: globalProfileIsAuthoritative(generalProfile),
      skippedSensitive: [...new Set(skippedSensitive)].slice(0, 10),
      unresolved: unresolvedQuestions(),
      platform: detectPlatform(),
    };
  }

  function decodeBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function uploadResume(fileName, base64, mimeType = "application/pdf") {
    const inputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const targets = inputs.filter((input) => {
      const text = fieldText(input);
      return RESUME_RE.test(text) && !NON_RESUME_FILE_RE.test(text) && !SENSITIVE_RE.test(text);
    });
    if (!targets.length) return { uploaded: 0, reason: "resume-field-not-found" };

    const file = new File([decodeBase64(base64)], fileName, { type: mimeType });
    let uploaded = 0;
    for (const input of targets.slice(0, 1)) {
      try {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        dispatch(input);
        uploaded += 1;
      } catch {}
    }
    return { uploaded, reason: uploaded ? "ok" : "file-input-rejected" };
  }

  function detectPlatform() {
    const host = location.hostname.toLowerCase();
    const body = normalize(document.body?.innerText?.slice(0, 4000));
    if (host.includes("join.qq.com")) return "Tencent Campus";
    if (host.includes("greenhouse") || body.includes("greenhouse")) return "Greenhouse";
    if (host.includes("lever.co") || body.includes("lever")) return "Lever";
    if (host.includes("ashbyhq") || body.includes("ashby")) return "Ashby";
    if (host.includes("myworkdayjobs") || host.includes("workday") || body.includes("workday")) return "Workday";
    return "Generic ATS";
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "IVY_FILL_PAGE") {
      chrome.storage.local.get(["ivyProfile"], (result) => {
        fill(result.ivyProfile || {}, message.generalProfile || null, message.applicationPacket || null)
          .then((payload) => sendResponse({ ok: true, ...payload }))
          .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      });
      return true;
    }
    if (message?.type === "IVY_UPLOAD_RESUME") {
      try {
        sendResponse({ ok: true, ...uploadResume(message.fileName, message.base64, message.mimeType) });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return false;
    }
  });
})();
