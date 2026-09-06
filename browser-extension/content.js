(() => {
  const CONTENT_SCRIPT_VERSION = "0.6.6";
  if (window.__ivyJobAutofillLoaded === CONTENT_SCRIPT_VERSION) return;
  window.__ivyJobAutofillLoaded = CONTENT_SCRIPT_VERSION;

  const SENSITIVE_RE = /(race|ethnic|gender|sex(?!ual)|veteran|disability|religion|marital|sexual orientation|pronoun|date of birth|birth date|ssn|social security|demographic|eeo|equal employment|种族|族裔|民族|性别|残障|退伍|宗教|出生日期|社会安全号)/i;
  const NEVER_AUTOFILL_RE = /(ssn|social security|taxpayer|passport number|bank account|routing number|credit card|password|社会安全号|银行卡|密码)/i;
  const SUBMIT_RE = /(submit|send application|complete application|apply now|finish application|提交申请|完成申请)/i;
  const FINAL_SUBMIT_RE = /^(?:submit(?: application)?|send application|complete application|finish application|提交申请|完成申请)$/i;
  const APPLICATION_ENTRY_RE = /^(?:apply|apply now|start application|continue application|立即申请|马上申请|申请职位)$/i;
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

    // Some Chinese application forms render labels as siblings outside the
    // actual input wrapper. Read only nearby non-control siblings so a date
    // input can see labels such as "起止时间" without inheriting every label
    // from the complete education or project card.
    let cursor = el;
    for (let depth = 0; depth < 6 && cursor?.parentElement; depth += 1) {
      const parent = cursor.parentElement;
      let sibling = cursor.previousElementSibling;
      for (let step = 0; step < 2 && sibling; step += 1, sibling = sibling.previousElementSibling) {
        const containsControl = sibling.matches?.('input, textarea, select, [role="combobox"]')
          || sibling.querySelector?.('input, textarea, select, [role="combobox"]');
        if (!containsControl) pieces.push(sibling.textContent);
      }
      cursor = parent;
    }
    return normalize(pieces.filter(Boolean).join(" "));
  }

  function directFieldText(el) {
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
    const wrappingLabel = el.closest?.("label");
    if (wrappingLabel) {
      const text = String(wrappingLabel.textContent || "").trim();
      if (text.length <= 120) pieces.push(text);
    }
    return normalize(pieces.filter(Boolean).join(" "));
  }

  function nearbyLabelText(el) {
    const pieces = [];
    let cursor = el;
    for (let depth = 0; depth < 6 && cursor?.parentElement; depth += 1) {
      let sibling = cursor.previousElementSibling;
      for (let step = 0; step < 2 && sibling; step += 1, sibling = sibling.previousElementSibling) {
        const containsControl = sibling.matches?.('input, textarea, select, [role="combobox"]')
          || sibling.querySelector?.('input, textarea, select, [role="combobox"]');
        if (!containsControl) {
          const text = String(sibling.textContent || "").trim();
          if (text && text.length <= 160) pieces.push(text);
        }
      }
      cursor = cursor.parentElement;
    }
    return normalize(pieces.join(" "));
  }

  function getProfileValue(profile, key) {
    const path = key.split(".");
    let value = profile;
    for (const part of path) value = value && value[part];
    return value == null ? "" : String(value).trim();
  }

  const RULES = [
    ["identity.fullName", /\b(full name|legal name|complete name)\b|中文姓名|姓名/],
    ["identity.firstName", /\b(first name|given name|forename)\b|名字/],
    ["identity.middleName", /\b(middle name|middle initial)\b/],
    ["identity.lastName", /\b(last name|family name|surname)\b|姓氏/],
    ["identity.preferredName", /\b(preferred name|chosen name|nickname)\b/],
    ["identity.email", /\b(e mail|email address|email)\b|邮箱/],
    ["identity.phone", /\b(phone|mobile|telephone|cell)\b|手机|电话/],
    ["identity.nativePlace", /\b(native place|place of origin|hometown)\b|籍贯/],
    ["identity.birthPlace", /\b(place of birth|birthplace|birth place)\b|出生地/],
    ["identity.wechat", /\b(wechat|weixin)\b|微信号|微信/],
    ["location.address2", /\b(address line 2|address 2|apt|apartment|suite|unit)\b/],
    ["location.address1", /\b(street address|address line 1|address 1|mailing address|home address)\b|家庭住址|居住地址|通讯地址|详细地址/],
    ["location.postalCode", /\b(zip|zip code|postal|postal code)\b|邮编/],
    ["location.city", /\b(city|town)\b|城市/],
    ["location.state", /\b(state|province|region)\b|州|省份/],
    ["location.country", /\b(country|country of residence)\b|国家/],
    ["portfolio.url", /作品链接|作品网址|作品地址/],
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

    ["employment.description", /\b(job description|role description|description of duties|job duties|work responsibilities)\b|工作职责|工作内容|工作描述|岗位职责/],
    ["employment.employer", /\b(current employer|employer|company name|organization name)\b|雇主|公司名称/],
    ["employment.title", /\b(current title|job title|position title|role title)\b|职位名称|职位/],
    ["employment.location", /\b(employment location|work location)\b/],
    ["employment.startMonth", /\b(employment start month|job start month)\b/],
    ["employment.startYear", /\b(employment start year|job start year)\b/],
    ["employment.endMonth", /\b(employment end month|job end month)\b/],
    ["employment.endYear", /\b(employment end year|job end year)\b/],

    ["campus.description", /\b(campus experience description|activity description|extracurricular description)\b|校园经历描述|校园活动描述|活动描述|经历描述/],
    ["campus.organization", /\b(campus organization|student organization|club name|activity organization)\b|校园组织|学生组织|社团名称|组织名称/],
    ["campus.role", /\b(campus role|activity role|leadership role)\b|校园角色|活动角色|担任职务|职务/],
    ["campus.startDate", /\b(campus start date|activity start date)\b|校园经历开始时间|活动开始时间/],
    ["campus.endDate", /\b(campus end date|activity end date)\b|校园经历结束时间|活动结束时间/],

    ["language.proficiency", /\b(language proficiency|proficiency level|fluency)\b|精通程度|熟练程度|语言水平/],
    ["language.name", /\b(language|spoken language)\b|(?<!能)语言(?!能力)/],
    ["award.type", /\b(award type|award category|honou?r type)\b|奖项类型|奖励类型/],
    ["award.year", /\b(award year|award date|date received)\b|获奖时间|获奖年份/],
    ["award.name", /\b(award name|award title|honou?r name)\b|获奖名称|奖项名称/],
    ["award.summary", /\b(award details|award summary|award description)\b|获奖情况|获奖详情/],
    ["portfolio.url", /\b(portfolio link|work sample link|work url)\b|作品链接|作品网址|作品地址/],
    ["project.url", /\b(project url|project link|project website|repository url|repo url|project address)\b|项目链接|项目地址|项目网址|项目url/],
    ["project.description", /\b(project description|project summary|research description)\b|项目描述|项目简介|研究描述/],
    ["project.name", /\b(project name|project title|research project title)\b|项目名称|项目标题/],
    ["project.role", /\b(project role|research role|role in project|project contribution)\b|项目角色|项目职责/],
    ["cv.skills", /\b(technical skills|key skills|skills)\b|专业技能|技能清单/],
    ["cv.publications", /\b(selected publications|publications|publication list)\b|论文列表|代表论文/],
    ["publication.title", /\b(publication title|paper title|article title)\b|论文名称|论文题目/],
    ["publication.authorOrder", /\b(author order|authorship|author position)\b|作者顺序|作者位次/],
    ["publication.date", /\b(publication date|published date|date published)\b|发表时间|发表日期/],
    ["publication.jcrQuartile", /\bjcr\s*(?:quartile|ranking|rank|分区)?\b|JCR\s*分区/i],
    ["publication.casQuartile", /\bcas\s*(?:quartile|ranking|rank)?\b|中科院(?:期刊)?分区/i],
    ["publication.ccfCategory", /\bccf\s*(?:category|ranking|rank|level)?\b|CCF\s*(?:等级|分类)/i],
    ["publication.level", /\b(publication|paper|journal)\s*(?:level|ranking|rank|tier)\b|论文等级|期刊等级/],
    ["publication.venue", /\b(journal|venue|publisher|publication venue|institution)\b|刊物\s*机构|刊物|期刊|发表机构/],
    ["publication.details", /\b(publication details|paper details|article details|publication url)\b|论文详情|论文链接/],
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

  function confirmedSensitiveKey(text) {
    if (NEVER_AUTOFILL_RE.test(text)) return "";
    if (/\b(date of birth|birth date)\b|出生日期/.test(text)) return "identity.birthDate";
    if (/民族|族裔/.test(text)) return "identity.ethnicity";
    if (/性别/.test(text)) return "identity.gender";
    if (/\b(race|ethnicity|ethnic group)\b/.test(text)) return "sensitive.raceUS";
    if (/\b(gender|sex)\b/.test(text)) return "sensitive.genderUS";
    if (/\bveteran\b|退伍/.test(text)) return "sensitive.veteranStatusUS";
    if (/\bdisabilit/.test(text) || /残障/.test(text)) return "sensitive.disabilityStatusUS";
    if (/\breligion\b|宗教/.test(text)) return "sensitive.religion";
    return "";
  }

  function sectionFromText(text) {
    const normalized = normalize(text);
    if (/荣誉奖励|奖励荣誉|奖项荣誉|honou?rs? awards?|awards? honou?rs?/.test(normalized)) return "award";
    if (/论文\s*期刊|论文期刊|学术论文|发表成果|publications?|papers? journals?/.test(normalized)) return "publication";
    if (/教育背景|教育经历|学历信息|academic background|education history|education experience/.test(normalized)) return "education";
    if (/校园经历|校内经历|校园活动|学生工作|社团经历|社会实践|campus experience|campus activities|student activities|extracurricular activities?/.test(normalized)) return "campus";
    if (/实习经历|工作经历|行业经历|职业经历|employment history|work experience|professional experience|internship experience/.test(normalized)) return "employment";
    if (/项目经历|研究项目|科研项目|project experience|research projects?/.test(normalized)) return "project";
    if (/语言能力|语言技能|language skills?|languages?/.test(normalized)) return "language";
    if (/作品展示|作品链接|项目作品|portfolio|work samples?/.test(normalized)) return "portfolio";
    if (/专业技能|技术技能|技能清单|technical skills?|professional skills?/.test(normalized)) return "skills";
    const sections = [
      ["project", [/项目名称|project name|project title/, /项目角色|project role|role in project/, /项目链接|项目地址|项目网址|project (?:url|link|website)/]],
      ["award", [/奖项|奖励|award|honou?r/, /时间|日期|date|year/, /情况|详情|描述|名称|类型|summary|description|name|type/]],
      ["publication", [/论文|文章|publication|paper|article/, /作者|author|authorship/, /发表|刊物|期刊|机构|journal|venue|publisher/]],
      ["education", [/学校|大学|school|university/, /学历|学位|degree/, /专业|major|field of study/]],
      ["campus", [/校园|校内|学生组织|社团|campus|student organization|extracurricular/, /职务|角色|活动|经历|role|position|activity|experience/]],
      ["employment", [/公司|雇主|单位|employer|company|organization/, /职位|岗位|title|position|role/, /职责|工作内容|duties|responsibilities|description/]],
      ["portfolio", [/作品链接|作品网址|portfolio link|work sample link/, /作品附件|work sample attachment|portfolio attachment/]],
      ["language", [/语言|language/, /精通程度|熟练程度|proficiency|fluency/]],
      ["skills", [/技能|skills?/, /工具|技术|编程|software|technical|programming/]],
    ];
    for (const [section, patterns] of sections) {
      if (patterns.filter((pattern) => pattern.test(normalized)).length >= 2) return section;
    }
    return "";
  }

  function ancestorSectionInfo(el) {
    let node = el?.parentElement || null;
    let fallback = null;
    for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
      if (node === document.body) break;
      const text = normalize(node.textContent || "");
      const controls = visibleControls(node);
      if (text.length <= 12000 && controls.length >= 2 && controls.length <= 32) {
        const section = sectionFromText(text);
        if (section) {
          const info = { section, node };
          if (!fallback) fallback = info;
          return info;
        }
      }
    }
    return fallback || { section: "", node: null };
  }

  function semanticSectionKey(el, sectionInfo) {
    const { section, node } = sectionInfo;
    if (!section || !node) return null;
    const isSelectLike = el instanceof HTMLSelectElement || el.getAttribute?.("role") === "combobox" || Boolean(el.getAttribute?.("aria-autocomplete"));
    if (section === "award") {
      if (dateLikeField(el)) return "award.year";
      if (isSelectLike) return "award.type";
      if (el instanceof HTMLTextAreaElement) return "award.summary";
      return "award.name";
    }
    if (section === "publication") {
      if (dateLikeField(el)) return "publication.date";
      if (el instanceof HTMLTextAreaElement) return "publication.details";
      if (isSelectLike) {
        const selects = visibleControls(node).filter((control) => control instanceof HTMLSelectElement || control.getAttribute?.("role") === "combobox" || control.getAttribute?.("aria-autocomplete"));
        return selects.indexOf(el) <= 0 ? "publication.authorOrder" : "publication.venue";
      }
      return "publication.title";
    }
    if (section === "project") {
      const controls = visibleControls(node);
      const dates = controls.filter(dateLikeField);
      if (dateLikeField(el)) return dates.indexOf(el) <= 0 ? "project.startDate" : "project.endDate";
      if (el instanceof HTMLTextAreaElement) return "project.description";
      const raw = normalize([el.type, el.getAttribute?.("placeholder"), el.getAttribute?.("name")].filter(Boolean).join(" "));
      if (String(el.type || "").toLowerCase() === "url" || /url|link|网址|链接/.test(raw)) return "project.url";
      const shortText = controls.filter((control) => !dateLikeField(control) && !(control instanceof HTMLTextAreaElement));
      return shortText.indexOf(el) <= 0 ? "project.name" : "project.role";
    }
    if (section === "education") {
      const dates = visibleControls(node).filter(dateLikeField);
      if (dateLikeField(el)) return dates.indexOf(el) <= 0 ? "education.startDate" : "education.endDate";
      return null;
    }
    if (section === "employment") {
      const controls = visibleControls(node);
      const dates = controls.filter(dateLikeField);
      const labeledKey = employmentLabelKey(directFieldText(el) || nearbyLabelText(el));
      if (labeledKey) return labeledKey;
      if (dateLikeField(el)) return dates.indexOf(el) <= 0 ? "employment.startDate" : "employment.endDate";
      if (el instanceof HTMLTextAreaElement) return "employment.description";
      const shortText = controls.filter((control) => (
        !dateLikeField(control)
        && !(control instanceof HTMLTextAreaElement)
        && !(["checkbox", "radio"].includes(String(control.type || "").toLowerCase()))
      ));
      const index = shortText.indexOf(el);
      return index === 0 ? "employment.employer" : index === 1 ? "employment.title" : index === 2 ? "employment.location" : null;
    }
    if (section === "campus") {
      const controls = visibleControls(node);
      const dates = controls.filter(dateLikeField);
      if (dateLikeField(el)) return dates.indexOf(el) <= 0 ? "campus.startDate" : "campus.endDate";
      if (el instanceof HTMLTextAreaElement) return "campus.description";
      const shortText = controls.filter((control) => !dateLikeField(control) && !(control instanceof HTMLTextAreaElement));
      return shortText.indexOf(el) <= 0 ? "campus.organization" : "campus.role";
    }
    if (section === "language") {
      const controls = visibleControls(node).filter((control) => control instanceof HTMLSelectElement || control.getAttribute?.("role") === "combobox" || control.getAttribute?.("aria-autocomplete"));
      return controls.indexOf(el) <= 0 ? "language.name" : "language.proficiency";
    }
    if (section === "portfolio") {
      if (el instanceof HTMLTextAreaElement) return "portfolio.description";
      return "portfolio.url";
    }
    if (section === "skills" && el instanceof HTMLTextAreaElement) return "cv.skills";
    return null;
  }

  function employmentLabelKey(text) {
    const value = normalize(text);
    if (!value) return "";
    if (/\b(role description|job description|description of duties|job duties|work responsibilities)\b|工作职责|工作内容|工作描述|岗位职责/.test(value)) return "employment.description";
    if (/(?:^| )(?:company|employer|organization|organisation|company name|organization name|organisation name|current employer)(?: |$)|公司名称|雇主|任职单位/.test(value)) return "employment.employer";
    if (/(?:^| )(?:job title|position title|role title|current title|title|position)(?: |$)|职位名称|岗位|职位/.test(value)) return "employment.title";
    if (/(?:^| )(?:location|employment location|work location)(?: |$)|所在地|工作地点/.test(value)) return "employment.location";
    if (/(?:^| )(?:from|start|start date)(?: |$)|开始日期|开始时间/.test(value)) return "employment.startDate";
    if (/(?:^| )(?:to|end|end date)(?: |$)|结束日期|结束时间/.test(value)) return "employment.endDate";
    return "";
  }

  function contextualKey(el, text, projectDateCounters, sectionInfo = null) {
    const resolvedSectionInfo = sectionInfo || ancestorSectionInfo(el);
    const section = resolvedSectionInfo.section;
    const campusNode = section === "campus" ? resolvedSectionInfo.node : nearestSectionNode(el, "campus");
    if (campusNode && dateLikeField(el)) {
      const dates = visibleControls(campusNode).filter(dateLikeField);
      const index = Math.max(0, dates.indexOf(el));
      return index % 2 === 0 ? "campus.startDate" : "campus.endDate";
    }
    const direct = inferKey(text);
    if (direct) return direct;

    if (section === "award" && /(?:^| )描述(?: |$)|(?:^| )description(?: |$)/.test(text)) return "award.description";
    if (section === "portfolio" && /(?:^| )描述(?: |$)|(?:^| )description(?: |$)/.test(text)) return "portfolio.description";
    if (section === "project" && /(?:^| )描述(?: |$)|(?:^| )(?:description|summary)(?: |$)/.test(text)) return "project.description";
    if (section === "project" && /(?:^| )角色(?: |$)|(?:^| )role(?: |$)/.test(text)) return "project.role";
    if (section === "project" && /起止时间|项目时间|项目日期|project dates?|project period|date range/.test(text)) {
      const counterKey = "project:date-pair";
      const index = projectDateCounters.get(counterKey) || 0;
      projectDateCounters.set(counterKey, index + 1);
      return index % 2 === 0 ? "project.startDate" : "project.endDate";
    }
    return semanticSectionKey(el, resolvedSectionInfo);
  }

  function nearestSectionNode(el, section) {
    let node = el?.parentElement || null;
    for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
      const text = normalize(node.textContent || "");
      if (text.length <= 16000 && sectionFromText(text) === section) return node;
      if (node === document.body) break;
    }
    return null;
  }

  function packetIsAuthoritative(packet) {
    return Boolean(
      packet
      && (
        (["final_customized_cv_only", "frozen_submitted_template"].includes(packet.authority)
          && /^APP-\d{4}-/i.test(String(packet.application_id || "")))
        || (packet.authority === "live_cv_template"
          && /^TEMPLATE:/i.test(String(packet.application_id || "")))
      ),
    );
  }

  function globalProfileIsAuthoritative(profile) {
    return Boolean(profile && profile.schema_version === "global-application-autofill-profile-v1" && Array.isArray(profile.education));
  }

  function hasGlobalPublications(profile) {
    return globalProfileIsAuthoritative(profile) && Array.isArray(profile.publications) && profile.publications.length > 0;
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

  function normalizedYearMonth(year, month) {
    const cleanYear = String(year || "").match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
    const cleanMonth = String(month || "").match(/\b(?:0?[1-9]|1[0-2])\b/)?.[0] || "";
    return cleanYear && cleanMonth ? `${cleanYear}-${cleanMonth.padStart(2, "0")}` : "";
  }

  function currentYearMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function projectDateRange(entry) {
    const source = [entry?.date_range, entry?.date, entry?.period, entry?.dates]
      .map((value) => String(value || "").trim())
      .find(Boolean) || "";
    const matches = [...source.matchAll(/((?:19|20)\d{2})\s*(?:年|[.\/-])\s*(0?[1-9]|1[0-2])\s*(?:月)?/g)];
    return {
      start: String(entry?.start_date || entry?.start || "").trim() || normalizedYearMonth(entry?.start_year, entry?.start_month) || (matches[0] ? normalizedYearMonth(matches[0][1], matches[0][2]) : ""),
      end: String(entry?.end_date || entry?.end || "").trim() || normalizedYearMonth(entry?.end_year, entry?.end_month) || (matches[1] ? normalizedYearMonth(matches[1][1], matches[1][2]) : "") || (entry?.current ? currentYearMonth() : ""),
    };
  }

  function bulletText(entry) {
    if (Array.isArray(entry?.bullets)) return entry.bullets.filter(Boolean).join("\n");
    return String(entry?.description || entry?.summary || "").trim();
  }

  function publicationEntry(entry, profileLanguage = "") {
    if (typeof entry === "string") {
      const citation = entry.trim();
      const quotedTitle = citation.match(/[“\"]([^”\"]{8,})[”\"]/i)?.[1]?.trim() || "";
      const emphasizedVenue = citation.match(/\\emph\{([^}]+)\}/i)?.[1]?.trim() || "";
      const year = citation.match(/\b((?:19|20)\d{2})\b(?![\s\S]*\b(?:19|20)\d{2}\b)/)?.[1] || "";
      const firstAuthor = /^(?:\\item\s*)?(?:zhang\s*,\s*x\.?|xinyu\s+zhang)\b/i.test(citation);
      return { title: quotedTitle || citation, authorOrder: firstAuthor ? "第一作者" : "", date: year, venue: emphasizedVenue, details: citation };
    }
    const year = entry?.year || entry?.publication_year || entry?.published_year;
    const month = entry?.month || entry?.publication_month || entry?.published_month;
    const date = String(entry?.publication_date || entry?.published_at || entry?.date || "").trim()
      || normalizedYearMonth(year, month)
      || String(year || "").trim();
    const useChinese = profileLanguage === "zh"
      || (!profileLanguage && (pageUsesChinese() || /(?:^|\.)cn$/i.test(location.hostname)));
    const localizedDescription = useChinese
      ? entry?.description_zh || entry?.details || entry?.description || entry?.description_en
      : entry?.description_en || entry?.details || entry?.description || entry?.description_zh;
    const details = [
      entry?.citation,
      localizedDescription,
      entry?.status,
      entry?.url,
    ].map((value) => String(value || "").trim()).filter(Boolean);
    return {
      title: String(entry?.title || entry?.name || entry?.paper_title || "").trim(),
      authorOrder: String(useChinese
        ? entry?.author_order_zh || entry?.author_order || entry?.author_order_en || entry?.authorship || entry?.author_role || entry?.role
        : entry?.author_order_en || entry?.author_order || entry?.author_order_zh || entry?.authorship || entry?.author_role || entry?.role || "").trim(),
      date,
      venue: String(entry?.venue || entry?.journal || entry?.publisher || entry?.institution || entry?.conference || "").trim(),
      level: String(entry?.best_verified_rank || entry?.level || entry?.tier || entry?.journal_level || entry?.publication_level || "").trim(),
      jcrQuartile: String(entry?.jcr_quartile || "").trim(),
      casQuartile: String(entry?.cas_quartile || "").trim(),
      ccfCategory: String(entry?.ccf_category || "").trim(),
      details: [...new Set(details)].join("；"),
    };
  }

  function authorshipAliases(value) {
    const text = normalize(value);
    if (/first|第一/.test(text)) return ["第一作者", "一作", "First Author", "First-author"];
    if (/correspond|通讯/.test(text)) return ["通讯作者", "Corresponding Author"];
    if (/second|第二/.test(text)) return ["第二作者", "共同作者", "其他作者", "Second Author", "Co-author"];
    if (/third|第三/.test(text)) return ["第三作者", "共同作者", "其他作者", "Third Author", "Co-author"];
    if (/fourth|第四/.test(text)) return ["第四作者", "共同作者", "其他作者", "Fourth Author", "Co-author"];
    if (/co.?author|共同作者|合著/.test(text)) return ["共同作者", "其他作者", "Co-author"];
    return [];
  }

  function publicationVenueAliases(value) {
    const text = normalize(value);
    if (/conference|会议|symposium|workshop|congress/.test(text)) return ["会议", "学术会议", "Conference", "其他", "Other"];
    if (/journal|期刊|neuroscience|medicine|statistics|biostat/.test(text)) return ["期刊", "学术期刊", "Journal", "其他", "Other"];
    return ["其他", "Other"];
  }

  function isSelectLike(el) {
    return el instanceof HTMLSelectElement || el.getAttribute?.("role") === "combobox" || Boolean(el.getAttribute?.("aria-autocomplete"));
  }

  function publicationLevelControl(el) {
    if (!isSelectLike(el)) return false;
    const optionText = el instanceof HTMLSelectElement
      ? Array.from(el.options || []).map((option) => String(option.textContent || option.value || "")).join(" ")
      : String(el.getAttribute?.("aria-label") || "");
    return /\blevel\s*[123]\b|中科院|ccf\s*[abc]|ssci|sci\s*q[1-4]|期刊等级|论文等级/i.test(optionText);
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
      const startDate = normalizedYearMonth(entry.start_year, entry.start_month) || String(entry.start_date || entry.start || "").trim();
      const endDate = normalizedYearMonth(entry.end_year, entry.end_month) || String(entry.end_date || entry.end || "").trim() || (entry.current ? currentYearMonth() : "");
      const map = {
        "employment.employer": entry.organization,
        "employment.title": entry.title,
        "employment.location": entry.location,
        "employment.startMonth": entry.start_month,
        "employment.startYear": entry.start_year,
        "employment.endMonth": entry.end_month,
        "employment.endYear": entry.end_year,
        "employment.startDate": startDate,
        "employment.endDate": endDate,
        "employment.description": Array.isArray(entry.bullets) ? entry.bullets.join("\n") : "",
      };
      return { handled: true, value: String(map[key] || "").trim() };
    }

    if (key.startsWith("project.")) {
      const entries = Array.isArray(packet.projects) ? packet.projects : [];
      const index = nextIndex(counters, "projects", key);
      const entry = entries[index];
      if (!entry) return { handled: true, value: "" };
      const dates = projectDateRange(entry);
      const map = {
        "project.name": entry.name,
        "project.role": entry.role || entry.author_role || entry.contribution || entry.position,
        "project.description": bulletText(entry),
        "project.url": projectUrl(entry),
        "project.startDate": dates.start,
        "project.endDate": dates.end,
        "project.startMonth": entry.start_month,
        "project.startYear": entry.start_year,
        "project.endMonth": entry.end_month,
        "project.endYear": entry.end_year,
      };
      return { handled: true, value: String(map[key] || "").trim() };
    }

    if (key.startsWith("campus.")) {
      const entries = Array.isArray(packet.campus_experiences) ? packet.campus_experiences : [];
      const index = nextIndex(counters, "campus-experiences", key);
      const entry = entries[index];
      if (!entry) return { handled: true, value: "" };
      const startDate = normalizedYearMonth(entry.start_year, entry.start_month) || String(entry.start_date || entry.start || "").trim();
      const endDate = normalizedYearMonth(entry.end_year, entry.end_month) || String(entry.end_date || entry.end || "").trim() || (entry.current ? currentYearMonth() : "");
      const map = {
        "campus.organization": entry.organization || entry.name,
        "campus.role": entry.role || entry.title || entry.position,
        "campus.startDate": startDate,
        "campus.endDate": endDate,
        "campus.description": bulletText(entry),
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
      return { handled: true, value: publications.map((entry) => publicationEntry(entry).details || publicationEntry(entry).title).filter(Boolean).join("\n") };
    }

    if (key.startsWith("publication.")) {
      const entries = Array.isArray(packet.publications) ? packet.publications : [];
      const index = nextIndex(counters, "publications", key);
      const entry = publicationEntry(entries[index]);
      const map = {
        "publication.title": entry.title,
        "publication.authorOrder": entry.authorOrder,
        "publication.date": entry.date,
        "publication.venue": entry.venue,
        "publication.details": entry.details || entry.title,
      };
      const value = String(map[key] || "").trim();
      const aliases = key === "publication.authorOrder" ? authorshipAliases(value)
        : key === "publication.venue" ? publicationVenueAliases(value) : [];
      return { handled: true, value, aliases };
    }

    return { handled: false, value: "" };
  }

  function orderedEducationEntries(entries) {
    const rank = (entry) => {
      const text = normalize([entry?.degree_type, entry?.degree, entry?.degree_en].filter(Boolean).join(" "));
      if (/博士|doctor|ph d/.test(text)) return 0;
      if (/硕士|master|m s/.test(text)) return 1;
      if (/学士|本科|bachelor|b s/.test(text)) return 2;
      return 9;
    };
    return (Array.isArray(entries) ? entries : []).map((entry, index) => ({ entry, index }))
      .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
      .map(({ entry }) => entry);
  }

  function globalEducationValue(generalProfile, key, counters) {
    if (!globalProfileIsAuthoritative(generalProfile) || !key.startsWith("education.")) return { handled: false, value: "" };
    const entries = orderedEducationEntries(generalProfile.education);
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

  function generalEntryValue(generalProfile, key, counters, profileLanguage = "") {
    if (!globalProfileIsAuthoritative(generalProfile)) return { handled: false, value: "", aliases: [] };
    const groups = {
      language: { entries: generalProfile.languages, fields: { name: "language", proficiency: "" } },
      award: { entries: generalProfile.awards, fields: { type: "type", year: "year", name: "name", description: "description", summary: "summary" } },
      portfolio: { entries: generalProfile.portfolio, fields: { url: "url", description: "description" } },
      campus: { entries: generalProfile.campus_experiences, fields: { organization: "organization", role: "role", description: "description", startDate: "start_date", endDate: "end_date" } },
    };
    const [group, field] = key.split(".");
    const config = groups[group];
    if (!config) return { handled: false, value: "", aliases: [] };
    const entries = Array.isArray(config.entries) ? config.entries : [];
    const index = nextIndex(counters, group, key);
    const entry = entries[index];
    if (!entry) return { handled: true, value: "", aliases: [] };
    const sourceKey = config.fields[field];
    if (!sourceKey) return { handled: true, value: "", aliases: [] };
    const useChinese = profileLanguage === "zh"
      || (!profileLanguage && (pageUsesChinese() || /(?:^|\.)cn$/i.test(location.hostname)));
    let value = String(entry[sourceKey] || "").trim();
    if (group === "award" && field === "description") {
      value = String(useChinese
        ? entry.description_zh || entry.description || entry.description_en
        : entry.description_en || entry.description || entry.description_zh || "").trim();
    }
    if (group === "campus" && field === "startDate") {
      value = value || normalizedYearMonth(entry.start_year, entry.start_month) || String(entry.start || "").trim();
    }
    if (group === "campus" && field === "endDate") {
      value = value || normalizedYearMonth(entry.end_year, entry.end_month) || String(entry.end || "").trim() || (entry.current ? currentYearMonth() : "");
    }
    let aliases = key === "language.name" && Array.isArray(entry.aliases) ? entry.aliases.map(String) : [];
    if (key === "award.type") {
      const team = /team|团队|四人|group/i.test([entry.type, entry.category, entry.description].filter(Boolean).join(" "));
      value = useChinese ? (team ? "团队奖" : "个人奖") : (team ? "Team Award" : "Individual Award");
      aliases = team ? ["团队奖", "团队", "Team Award", "Group Award", "其他", "Other"] : ["个人奖", "个人", "Individual Award", "其他", "Other"];
    }
    if (key === "award.summary") {
      const description = useChinese
        ? entry.description_zh || entry.description || entry.description_en
        : entry.description_en || entry.description || entry.description_zh;
      value = [entry.name, description].map((item) => String(item || "").trim()).filter(Boolean).join(useChinese ? "：" : ": ");
    }
    return { handled: true, value, aliases };
  }

  function globalIdentityValue(generalProfile, key) {
    if (!globalProfileIsAuthoritative(generalProfile) || !key.startsWith("identity.")) return { handled: false, value: "", aliases: [] };
    const identity = generalProfile.identity || {};
    const englishFullName = [identity.first_name_en, identity.middle_name_en, identity.last_name_en]
      .map((value) => String(value || "").trim()).filter(Boolean).join(" ");
    const map = {
      "identity.fullName": identity.full_name_en || englishFullName,
      "identity.firstName": identity.first_name_en,
      "identity.middleName": identity.middle_name_en,
      "identity.lastName": identity.last_name_en,
      "identity.preferredName": identity.preferred_name,
      "identity.email": identity.email,
      "identity.phone": identity.phone,
      "identity.nativePlace": identity.native_place,
      "identity.birthPlace": identity.birth_place,
      "identity.gender": identity.gender,
      "identity.ethnicity": identity.ethnicity,
      "identity.birthDate": identity.date_of_birth,
      "identity.wechat": identity.wechat,
    };
    if (!(key in map)) return { handled: false, value: "", aliases: [] };
    const value = String(map[key] || "").trim();
    const aliases = key === "identity.ethnicity" && /汉族|han/i.test(value) ? ["汉族", "汉", "Han", "Han Chinese"]
      : key === "identity.gender" && /女|female|woman/i.test(value) ? ["女", "女性", "Female", "Woman"]
      : key === "identity.gender" && /男|male|man/i.test(value) ? ["男", "男性", "Male", "Man"] : [];
    return { handled: true, value, aliases };
  }

  function fixedApplicationValue(generalProfile, key, profileLanguage = "") {
    const fixed = generalProfile?.fixed_application;
    if (!fixed || typeof fixed !== "object") return { handled: false, value: "", aliases: [] };
    const explicitLanguage = profileLanguage === "zh" || profileLanguage === "en" ? profileLanguage : "";
    const useChina = explicitLanguage
      ? explicitLanguage === "zh"
      : fixed.defaultLanguage === "zh" || (!fixed.defaultLanguage && (pageUsesChinese() || /(?:^|\.)cn$/i.test(location.hostname) || fixed.defaultRegion === "CN"));
    const identity = fixed.identity || {};
    const address = useChina ? fixed.addresses?.china || {} : fixed.addresses?.us || {};
    const phone = useChina
      ? identity.chinaPhone || identity.usPhone
      : identity.usPhone || identity.chinaPhone;
    const englishFullName = [identity.firstName, identity.middleName, identity.lastName]
      .map((value) => String(value || "").trim()).filter(Boolean).join(" ");
    const chineseFullName = String(identity.chineseFullName || "").trim()
      || [identity.chineseLastName, identity.chineseFirstName].map((value) => String(value || "").trim()).filter(Boolean).join("");
    const map = {
      "identity.fullName": useChina ? chineseFullName || englishFullName : englishFullName || chineseFullName,
      "identity.firstName": useChina ? identity.chineseFirstName || identity.firstName : identity.firstName,
      "identity.middleName": useChina ? "" : identity.middleName,
      "identity.lastName": useChina ? identity.chineseLastName || identity.lastName : identity.lastName,
      "identity.preferredName": useChina ? identity.chinesePreferredName || identity.preferredName : identity.preferredName,
      "identity.email": useChina ? identity.chineseEmail || identity.email : identity.email || identity.chineseEmail,
      "identity.phone": phone,
      "identity.nativePlace": useChina ? identity.nativePlaceZh || identity.nativePlaceEn : identity.nativePlaceEn || identity.nativePlaceZh,
      "identity.birthPlace": useChina ? identity.birthPlaceZh || identity.birthPlaceEn : identity.birthPlaceEn || identity.birthPlaceZh,
      "identity.gender": useChina ? identity.genderZh || identity.genderEn : identity.genderEn || identity.genderZh,
      "identity.ethnicity": useChina ? identity.ethnicityZh || identity.ethnicityEn : identity.ethnicityEn || identity.ethnicityZh,
      "identity.birthDate": identity.dateOfBirth,
      "identity.wechat": identity.wechat,
      "location.address1": address.address1,
      "location.address2": address.address2,
      "location.city": address.city,
      "location.state": address.state,
      "location.postalCode": address.postalCode,
      "location.country": address.country,
      "links.linkedin": fixed.links?.linkedin,
      "links.github": fixed.links?.github,
      "links.website": fixed.links?.website,
      "eligibility.age18": fixed.eligibility?.age18,
      "eligibility.workAuthorizationUS": useChina ? fixed.eligibility?.workAuthorizationChina : fixed.eligibility?.workAuthorizationUS,
      "eligibility.sponsorshipUS": fixed.eligibility?.sponsorshipUS,
      "eligibility.relocation": fixed.eligibility?.relocation,
      "eligibility.remoteWork": fixed.eligibility?.remoteWork,
      "application.availableStartDate": fixed.application?.availableStartDate,
      "application.hearAboutUs": fixed.application?.hearAboutUs,
      "sensitive.raceUS": fixed.sensitive?.allowAutofill ? fixed.sensitive?.raceUS : "",
      "sensitive.genderUS": fixed.sensitive?.allowAutofill ? fixed.sensitive?.genderUS : "",
      "sensitive.veteranStatusUS": fixed.sensitive?.allowAutofill ? fixed.sensitive?.veteranStatusUS : "",
      "sensitive.disabilityStatusUS": fixed.sensitive?.allowAutofill ? fixed.sensitive?.disabilityStatusUS : "",
      "sensitive.religion": fixed.sensitive?.allowAutofill ? fixed.sensitive?.religion : "",
    };
    if (!(key in map)) return { handled: false, value: "", aliases: [] };
    const value = String(map[key] || "").trim();
    const aliases = value === "yes" ? ["Yes", "是", "愿意", "可以"]
      : value === "no" ? ["No", "否", "不愿意", "不需要"]
      : key === "identity.ethnicity" && /汉族|han/i.test(value) ? ["汉族", "汉", "Han", "Han Chinese"]
      : key === "identity.gender" && /女|female|woman/i.test(value) ? ["女", "女性", "Female", "Woman"]
      : key === "identity.gender" && /男|male|man/i.test(value) ? ["男", "男性", "Male", "Man"]
      : key === "sensitive.raceUS" && /asian|亚裔/i.test(value) ? ["Asian", "Asian (Not Hispanic or Latino)", "Asian or Pacific Islander", "亚裔"]
      : key === "sensitive.genderUS" && /female|woman|女/i.test(value) ? ["Female", "Woman", "女", "女性"]
      : key === "sensitive.veteranStatusUS" && /not|no|不是/i.test(value) ? ["I am not a protected veteran", "Not a protected veteran", "No"]
      : key === "sensitive.disabilityStatusUS" && /not|no|不是/i.test(value) ? ["No, I do not have a disability and have not had one in the past", "No, I do not have a disability", "No"]
      : key === "sensitive.religion" && /none|no religion|没有/i.test(value) ? ["None", "No religion", "Not affiliated"] : [];
    return { handled: true, value, aliases };
  }

  function fixedAnswerForField(generalProfile, text) {
    const entries = generalProfile?.fixed_application?.fixedAnswers;
    if (!Array.isArray(entries) || !text || SENSITIVE_RE.test(text)) return "";
    const field = normalize(text).replace(/\b(required|optional)\b|必填|选填/g, "").trim();
    if (!field) return "";
    for (const entry of entries) {
      const question = normalize(entry?.question).replace(/\b(required|optional)\b|必填|选填/g, "").trim();
      const answer = String(entry?.answer || "").trim();
      if (!question || !answer) continue;
      if (field === question || (question.length >= 8 && (field.includes(question) || question.includes(field)))) return answer;
      const tokens = question.split(" ").filter((token) => token.length >= 3);
      if (tokens.length >= 3 && tokens.filter((token) => field.includes(token)).length / tokens.length >= 0.8) return answer;
    }
    return "";
  }

  function globalPublicationValue(generalProfile, key, counters, profileLanguage = "") {
    if (!globalProfileIsAuthoritative(generalProfile) || !key.startsWith("publication.")) return { handled: false, value: "", aliases: [] };
    const entries = Array.isArray(generalProfile.publications) ? generalProfile.publications : [];
    if (!entries.length) return { handled: false, value: "", aliases: [] };
    const index = nextIndex(counters, "global-publications", key);
    const entry = publicationEntry(entries[index], profileLanguage);
    const map = {
      "publication.title": entry.title,
      "publication.authorOrder": entry.authorOrder,
      "publication.date": entry.date,
      "publication.venue": entry.venue,
      "publication.level": entry.level,
      "publication.jcrQuartile": entry.jcrQuartile,
      "publication.casQuartile": entry.casQuartile,
      "publication.ccfCategory": entry.ccfCategory,
      "publication.details": entry.details || entry.title,
    };
    const value = String(map[key] || "").trim();
    const aliases = key === "publication.authorOrder" ? authorshipAliases(value)
      : key === "publication.venue" ? publicationVenueAliases(value) : [];
    return { handled: true, value, aliases };
  }

  function resolveValue(profile, generalProfile, packet, key, packetCounters, globalCounters, generalEntryCounters, profileLanguage = "") {
    const fixedValue = fixedApplicationValue(generalProfile, key, profileLanguage);
    if (fixedValue.handled && fixedValue.value) return { value: fixedValue.value, aliases: fixedValue.aliases };
    const identityValue = globalIdentityValue(generalProfile, key);
    if (identityValue.handled && identityValue.value) return { value: identityValue.value, aliases: identityValue.aliases };
    const publicationValue = globalPublicationValue(generalProfile, key, generalEntryCounters, profileLanguage);
    if (publicationValue.handled) return { value: publicationValue.value, aliases: publicationValue.aliases };
    if (key.startsWith("education.")) {
      const globalValue = globalEducationValue(generalProfile, key, globalCounters);
      if (globalValue.handled && globalValue.value) return { value: globalValue.value, aliases: [] };
      const packetValue = packetEntryValue(packet, key, packetCounters);
      if (packetValue.handled) return { value: packetValue.value, aliases: [] };
      if (globalValue.handled) return { value: "", aliases: [] };
      return { value: getProfileValue(profile, key), aliases: [] };
    }

    const generalValue = generalEntryValue(generalProfile, key, generalEntryCounters, profileLanguage);
    if (generalValue.handled) return { value: generalValue.value, aliases: generalValue.aliases };
    const packetValue = packetEntryValue(packet, key, packetCounters);
    if (packetValue.handled) return { value: packetValue.value, aliases: packetValue.aliases || [] };
    return { value: getProfileValue(profile, key), aliases: [] };
  }

  function dispatch(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setText(el, value) {
    if (!value || el.disabled) return false;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      if (!el.isContentEditable) return false;
      el.textContent = value;
      dispatch(el);
      return true;
    }
    if (el instanceof HTMLInputElement && el.type === "date" && /^\d{4}-\d{2}$/.test(value)) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    dispatch(el);
    return true;
  }

  function dateParts(value) {
    const source = String(value || "").trim();
    const monthFirst = source.match(/^\s*(1[0-2]|0?[1-9])\D+((?:19|20)\d{2})\s*$/);
    if (monthFirst) {
      return {
        year: monthFirst[2],
        month: String(monthFirst[1]).padStart(2, "0"),
        day: "",
      };
    }
    const match = source.match(/((?:19|20)\d{2})(?:\D+(1[0-2]|0?[1-9]))?(?:\D+(3[01]|[12]\d|0?[1-9]))?/);
    return match ? {
      year: match[1],
      month: match[2] ? String(match[2]).padStart(2, "0") : "",
      day: match[3] ? String(match[3]).padStart(2, "0") : "",
    } : { year: "", month: "", day: "" };
  }

  function lastDayOfMonth(year, month) {
    if (!year || !month) return "01";
    return String(new Date(Number(year), Number(month), 0).getDate()).padStart(2, "0");
  }

  function datePrecision(el) {
    const type = String(el?.type || el?.getAttribute?.("type") || "").toLowerCase();
    if (type === "month") return "month";
    if (type === "date") return "day";
    const raw = [el?.getAttribute?.("placeholder"), el?.getAttribute?.("aria-label"), el?.getAttribute?.("name"), el?.id]
      .filter(Boolean).join(" ").toLowerCase();
    if (/yyyy\s*[-/.年]\s*mm\s*[-/.月]\s*dd|年\s*月\s*日|选择日期|开始日期|结束日期|publication date|award date|date received/.test(raw)) return "day";
    if (/mm\s*[-/.]\s*yyyy|month\s*[-/.]\s*year|yyyy\s*[-/.年]\s*mm|年\s*月|year.?month|月份/.test(raw)) return "month";
    if (/yyyy|年份|year/.test(raw) || el?.getAttribute?.("maxlength") === "4") return "year";
    return "auto";
  }

  function dateCandidates(el, value, role = "neutral") {
    const parts = dateParts(value);
    if (!parts.year) return [];
    const month = parts.month || "01";
    const defaultDay = role === "end" ? lastDayOfMonth(parts.year, month) : "01";
    const day = parts.day || defaultDay;
    const rawHint = [el?.getAttribute?.("placeholder"), el?.getAttribute?.("aria-label"), el?.getAttribute?.("name")]
      .filter(Boolean).join(" ").toLowerCase();
    const monthFirst = /mm\s*[-/.]\s*yyyy|month\s*[-/.]\s*year/.test(rawHint)
      && !["month", "date"].includes(String(el?.type || "").toLowerCase());
    const formats = {
      year: parts.year,
      month: monthFirst ? `${month}/${parts.year}` : `${parts.year}-${month}`,
      day: `${parts.year}-${month}-${day}`,
    };
    const precision = datePrecision(el);
    const order = precision === "day" ? ["day", "month", "year"]
      : precision === "month" ? ["month", "day", "year"]
        : precision === "year" ? ["year", "month", "day"]
          : parts.day ? ["day", "month", "year"] : parts.month ? ["month", "day", "year"] : ["year", "month", "day"];
    return [...new Set(order.map((key) => formats[key]).filter(Boolean))];
  }

  function dateValueAccepted(el, candidate) {
    const actual = dateParts(el?.value || el?.getAttribute?.("value") || "");
    const expected = dateParts(candidate);
    if (!actual.year || actual.year !== expected.year) return false;
    if (expected.month && actual.month !== expected.month) return false;
    if (expected.day && actual.day && actual.day !== expected.day) return false;
    return true;
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

  function frameworkInput(el, value) {
    const previous = String(el.value || "");
    const ownPrototype = Object.getPrototypeOf(el);
    const ownSetter = Object.getOwnPropertyDescriptor(ownPrototype, "value")?.set;
    const nativeSetter = el instanceof HTMLTextAreaElement
      ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
      : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    const setter = ownSetter || nativeSetter;
    const tracker = el._valueTracker;
    if (tracker?.setValue) tracker.setValue(previous);
    if (setter) setter.call(el, value); else el.value = value;
    el.setAttribute?.("value", value);
    try {
      el.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: value,
        inputType: "insertReplacementText",
      }));
    } catch {
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }

  async function setAdaptiveDate(el, value, role = "neutral") {
    const candidates = dateCandidates(el, value, role);
    if (!candidates.length || !el || el.disabled) return false;
    const wasReadOnly = Boolean(el.readOnly);
    const hadReadOnlyAttribute = Boolean(el.hasAttribute?.("readonly"));

    for (const candidate of candidates) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (wasReadOnly) {
          el.readOnly = false;
          el.removeAttribute?.("readonly");
        }
        el.focus?.({ preventScroll: true });
        frameworkInput(el, candidate);
        if (attempt === 1 && typeof document.execCommand === "function") {
          try {
            el.select?.();
            document.execCommand("insertText", false, candidate);
            dispatch(el);
          } catch {}
        }
        if (attempt === 2) {
          try { el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true })); } catch {}
        }
        el.blur?.();
        await new Promise((resolve) => setTimeout(resolve, attempt === 2 ? 140 : 45));
        if (dateValueAccepted(el, candidate)) {
          if (wasReadOnly) el.readOnly = true;
          if (hadReadOnlyAttribute) el.setAttribute?.("readonly", "");
          return true;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
          const actual = String(el.value || el.getAttribute?.("value") || "");
          const difference = isoDayDifference(actual, candidate);
          if (difference === -1 || difference === 1) {
            const compensated = isoDayShift(candidate, -difference);
            frameworkInput(el, compensated);
            el.blur?.();
            await new Promise((resolve) => setTimeout(resolve, 45));
            if (dateValueAccepted(el, candidate)) {
              if (wasReadOnly) el.readOnly = true;
              if (hadReadOnlyAttribute) el.setAttribute?.("readonly", "");
              return true;
            }
          }
        }
      }
    }

    if (wasReadOnly) el.readOnly = true;
    if (hadReadOnlyAttribute) el.setAttribute?.("readonly", "");
    return false;
  }

  function visibleControls(node) {
    return Array.from(node?.querySelectorAll?.('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select, [role="combobox"]') || [])
      .filter(visible);
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

  function identityBlock(identityField) {
    let node = identityField?.parentElement || null;
    for (let depth = 0; node && depth < 14; depth += 1, node = node.parentElement) {
      const controls = visibleControls(node);
      const dates = controls.filter(dateLikeField);
      if (controls.includes(identityField) && dates.length >= 2 && controls.length <= 32) return { node, dates };
      if (node === document.body) break;
    }
    return null;
  }

  function findIdentityField(variants, usedFields) {
    const normalizedVariants = variants.map(normalize).filter((value) => value.length >= 3);
    if (!normalizedVariants.length) return null;
    const controls = visibleControls(document);
    return controls.find((control) => {
      if (usedFields.has(control)) return false;
      const value = normalize(control.value || control.getAttribute?.("value") || "");
      if (!value) return false;
      return normalizedVariants.some((variant) => value === variant || value.includes(variant) || variant.includes(value));
    }) || null;
  }

  async function setPeriodDates(dates, start, end) {
    let filled = 0;
    if (dates[0] && start && isEmpty(dates[0]) && await setAdaptiveDate(dates[0], start, "start")) filled += 1;
    if (dates[1] && end && isEmpty(dates[1]) && await setAdaptiveDate(dates[1], end, "end")) filled += 1;
    return filled;
  }

  async function correctEducationPeriods(generalProfile) {
    if (!globalProfileIsAuthoritative(generalProfile)) return 0;
    const usedFields = new Set();
    let filled = 0;
    for (const entry of generalProfile.education) {
      const identity = findIdentityField([entry?.school, entry?.school_zh], usedFields);
      if (!identity) continue;
      const block = identityBlock(identity);
      if (!block) continue;
      usedFields.add(identity);
      const start = normalizedYearMonth(entry?.start_year, entry?.start_month);
      const end = normalizedYearMonth(entry?.end_year, entry?.end_month);
      filled += await setPeriodDates(block.dates, start, end);
    }
    return filled;
  }

  async function correctProjectPeriods(applicationPacket) {
    if (!packetIsAuthoritative(applicationPacket)) return 0;
    const usedFields = new Set();
    let filled = 0;
    for (const entry of Array.isArray(applicationPacket.projects) ? applicationPacket.projects : []) {
      const identity = findIdentityField([entry?.name, entry?.title], usedFields);
      if (!identity) continue;
      const block = identityBlock(identity);
      if (!block) continue;
      usedFields.add(identity);
      const dates = projectDateRange(entry);
      filled += await setPeriodDates(block.dates, dates.start, dates.end);
    }
    return filled;
  }

  async function correctEmploymentPeriods(applicationPacket) {
    if (!packetIsAuthoritative(applicationPacket)) return 0;
    const usedFields = new Set();
    let filled = 0;
    for (const entry of Array.isArray(applicationPacket.experience) ? applicationPacket.experience : []) {
      const identity = findIdentityField([entry?.organization, entry?.employer, entry?.company], usedFields);
      if (!identity) continue;
      const block = identityBlock(identity);
      if (!block) continue;
      usedFields.add(identity);
      const start = normalizedYearMonth(entry?.start_year, entry?.start_month) || String(entry?.start_date || entry?.start || "").trim();
      const end = normalizedYearMonth(entry?.end_year, entry?.end_month) || String(entry?.end_date || entry?.end || "").trim() || (entry?.current ? currentYearMonth() : "");
      filled += await setPeriodDates(block.dates, start, end);
    }
    return filled;
  }

  function monthEquivalent(optionText, wanted) {
    const numeric = String(wanted || "").padStart(2, "0");
    const aliases = MONTH_NAMES[numeric];
    if (!aliases) return false;
    const option = normalize(optionText);
    return aliases.some((alias) => option === alias || option.startsWith(`${alias} `) || option.includes(` ${alias}`));
  }

  function candidateValues(value, aliases = []) {
    return [...new Set([value, ...aliases].map((item) => String(item || "").trim()).filter(Boolean))];
  }

  function setSelect(el, value, aliases = []) {
    if (!value || el.disabled) return false;
    const candidates = candidateValues(value, aliases);
    const wanted = candidates.map(normalize);
    const options = Array.from(el.options || []);
    let match = options.find((option) => wanted.includes(normalize(option.value)) || wanted.includes(normalize(option.textContent)));
    if (!match) match = options.find((option) => candidates.some((candidate) => monthEquivalent(option.textContent, candidate)));
    if (!match) match = options.find((option) => wanted.some((candidate) => normalize(option.textContent).includes(candidate) || candidate.includes(normalize(option.textContent))));
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

  async function setCombobox(el, value, aliases = []) {
    if (!value || el.disabled) return false;
    el.click();
    const editableInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    if (editableInput && !el.readOnly) setText(el, value);
    await new Promise((resolve) => setTimeout(resolve, 90));
    const candidates = candidateValues(value, aliases);
    const wanted = candidates.map(normalize);
    const options = Array.from(document.querySelectorAll('[role="option"], [data-automation-id="promptOption"], .select__option'))
      .filter(visible);
    let match = options.find((option) => wanted.includes(normalize(option.textContent)));
    if (!match) match = options.find((option) => candidates.some((candidate) => monthEquivalent(option.textContent, candidate)));
    if (!match) match = options.find((option) => wanted.some((candidate) => normalize(option.textContent).includes(candidate) || candidate.includes(normalize(option.textContent))));
    if (match) {
      match.click();
      dispatch(el);
      return true;
    }
    return Boolean(editableInput && !el.readOnly && el.value);
  }

  function isEmpty(el) {
    if (el instanceof HTMLInputElement && ["radio", "checkbox"].includes(el.type)) {
      if (!el.name) return !el.checked;
      return !document.querySelector(`input[name="${CSS.escape(el.name)}"]:checked`);
    }
    if (el instanceof HTMLSelectElement) {
      const value = String(el.value || "").trim();
      if (!value) return true;
      const selected = Array.from(el.options || []).find((option) => String(option.value) === value);
      return /^(?:请选择|选择|select|choose)/i.test(String(selected?.textContent || "").trim());
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return !String(el.value || "").trim();
    const rendered = [el.getAttribute?.("aria-valuetext"), el.getAttribute?.("data-value"), el.textContent]
      .map((value) => String(value || "").trim()).find(Boolean);
    return !rendered || /^(?:请选择|选择|请输入|select|choose|enter)$/i.test(rendered);
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

  function structuralPublicationTitleControl(el) {
    if (!(el instanceof HTMLInputElement) || dateLikeField(el)) return false;
    let node = el.parentElement || null;
    for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
      if (node === document.body) break;
      const controls = visibleControls(node);
      if (!controls.includes(el) || controls.length < 5 || controls.length > 16) continue;
      const dates = controls.filter(dateLikeField);
      const textareas = controls.filter((control) => control instanceof HTMLTextAreaElement);
      const selects = controls.filter((control) => isSelectLike(control));
      if (!dates.length || !textareas.length || selects.length < 2) continue;
      const titleInputs = controls.filter((control) => control instanceof HTMLInputElement && !dateLikeField(control) && !isSelectLike(control));
      if (titleInputs[0] === el) return true;
    }
    return false;
  }

  function isSectionIdentityControl(el, section) {
    const directText = directFieldText(el);
    const directKey = inferKey(directText);
    const identityKeys = {
      education: "education.school",
      publication: "publication.title",
      project: "project.name",
      employment: "employment.employer",
      award: "award.year",
      language: "language.name",
      portfolio: "portfolio.url",
      campus: "campus.organization",
    };
    if (identityKeys[section] && directKey === identityKeys[section]) return true;
    const nearbyKey = inferKey(nearbyLabelText(el));
    if (identityKeys[section] && nearbyKey === identityKeys[section]) return true;
    if (section === "publication" && structuralPublicationTitleControl(el)) return true;
    const sectionInfo = ancestorSectionInfo(el);
    if (sectionInfo.section !== section) return false;
    const semanticKey = semanticSectionKey(el, sectionInfo);
    if (section === "employment") {
      const labeledKey = employmentLabelKey(directText || nearbyLabelText(el));
      if (labeledKey) return labeledKey === "employment.employer";
      return semanticKey === "employment.employer";
    }
    if (identityKeys[section] && semanticKey === identityKeys[section]) return true;
    if (section === "education") {
      return /(?:^| )(?:学校名称|学校|大学|school|university|institution)(?: |$)/.test(directText)
        || semanticKey === "education.school";
    }
    if (section === "publication") {
      return /(?:^| )(?:题名|论文标题|文章标题|paper title|article title)(?: |$)/.test(directText)
        || semanticKey === "publication.title";
    }
    if (section === "project") {
      return /(?:^| )(?:项目题目|项目名称|project name|project title)(?: |$)/.test(directText)
        || semanticKey === "project.name";
    }
    return false;
  }

  function sectionIdentityControls(section) {
    return Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="button"]), textarea, select, [role="combobox"]'))
      .filter(visible)
      .filter((el) => isSectionIdentityControl(el, section));
  }

  function repeatedRecordBlock(identityField, section) {
    let node = identityField?.parentElement || null;
    let fallback = null;
    const maximumControls = section === "education" ? 32 : 16;
    for (let depth = 0; node && depth < 12; depth += 1, node = node.parentElement) {
      if (node === document.body) break;
      const controls = visibleControls(node);
      if (!controls.includes(identityField) || controls.length < 2 || controls.length > maximumControls) continue;
      if (!fallback) fallback = node;
      const identityCount = controls.filter((control) => isSectionIdentityControl(control, section)).length;
      if (identityCount === 1) return node;
    }
    return fallback;
  }

  function repeatedRecordControls(identityField, section, nextIdentityField = null) {
    const block = repeatedRecordBlock(identityField, section);
    if (block) return visibleControls(block);
    const controls = visibleControls(document);
    const start = controls.indexOf(identityField);
    if (start < 0) return [];
    const next = nextIdentityField ? controls.indexOf(nextIdentityField) : -1;
    const end = next > start ? next : Math.min(controls.length, start + 16);
    const candidates = controls.slice(start, end);
    if (next > start) return candidates;
    const finalLongText = candidates.findIndex((control) => control instanceof HTMLTextAreaElement);
    return finalLongText >= 0 ? candidates.slice(0, finalLongText + 1) : candidates;
  }

  function buttonBelongsToSection(button, section) {
    if (ancestorSectionInfo(button).section === section) return true;
    let node = button?.parentElement || null;
    for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
      if (node === document.body) break;
      const text = normalize(node.textContent || "");
      if (text.length <= 16000 && sectionFromText(text) === section) return true;
    }
    return false;
  }

  async function waitForIdentityIncrease(section, previousCount) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      const count = sectionIdentityControls(section).length;
      if (count > previousCount) return count;
    }
    return previousCount;
  }

  async function ensureRepeatedRows(section, desired) {
    if (!desired || !sectionIdentityControls(section).length) return 0;
    let added = 0;
    for (let attempt = 0; attempt < Math.min(desired, 20); attempt += 1) {
      const current = sectionIdentityControls(section).length;
      if (current >= desired) break;
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"]'))
        .filter(visible)
        .filter((button) => /^(?:\+\s*)?(?:添加|新增|add(?:\s+(?:another|publication|experience|job|position))?)$/i.test(String(button.textContent || button.value || "").trim()))
        .filter((button) => buttonBelongsToSection(button, section));
      const button = buttons[buttons.length - 1];
      if (!button) break;
      button.click();
      const nextCount = await waitForIdentityIncrease(section, current);
      if (nextCount <= current) break;
      added += nextCount - current;
    }
    return added;
  }

  async function fillMappedControl(el, key, value, aliases = []) {
    if (!value || !isEmpty(el)) return false;
    if (["project.startDate", "education.startDate", "employment.startDate", "campus.startDate"].includes(key)) return setAdaptiveDate(el, value, "start");
    if (["project.endDate", "education.endDate", "employment.endDate", "campus.endDate"].includes(key)) return setAdaptiveDate(el, value, "end");
    if (key === "publication.date" && /^\d{4}$/.test(value) && datePrecision(el) !== "year") return false;
    if (["award.year", "publication.date", "application.availableStartDate", "identity.birthDate"].includes(key)) return setAdaptiveDate(el, value, "neutral");
    if (el instanceof HTMLSelectElement) return setSelect(el, value, aliases);
    if (el instanceof HTMLInputElement && el.type === "radio") return setRadio(el, value);
    if (el instanceof HTMLInputElement && el.type === "checkbox") return false;
    if (el.getAttribute("role") === "combobox" || el.getAttribute("aria-autocomplete")) return setCombobox(el, value, aliases);
    return setText(el, value);
  }

  function pageUsesChinese() {
    return /[\u4e00-\u9fff]/.test(String(document.body?.innerText || document.body?.textContent || "").slice(0, 5000));
  }

  function localizedProfileText(value, preferChinese = pageUsesChinese()) {
    const text = String(value || "").trim();
    if (!text.includes("/")) return text;
    const parts = text.split("/").map((part) => part.trim()).filter(Boolean);
    return preferChinese ? (parts[parts.length - 1] || text) : (parts[0] || text);
  }

  function educationDegreeAliases(entry) {
    const source = [entry?.degree_type, entry?.degree, entry?.degree_en].map((value) => String(value || "").trim()).filter(Boolean);
    const text = normalize(source.join(" "));
    if (/博士|doctor|ph d/.test(text)) source.push("博士", "博士研究生", "PhD", "Doctoral degree");
    else if (/硕士|master|m s/.test(text)) source.push("硕士", "硕士研究生", "MS", "Master's degree");
    else if (/学士|本科|bachelor|b s/.test(text)) source.push("本科", "学士", "BS", "Bachelor's degree");
    return [...new Set(source)];
  }

  function educationControlKey(el, block) {
    const text = directFieldText(el);
    const dates = visibleControls(block).filter(dateLikeField);
    if (dateLikeField(el)) {
      if (/入学|开始|start|from/.test(text)) return "education.startDate";
      if (/毕业|结束|end|graduat|to/.test(text)) return "education.endDate";
      const index = dates.indexOf(el);
      if (index === 0) return "education.startDate";
      if (index === 1) return "education.endDate";
    }
    if (/是否最高学历|最高学历|是否双学位|双学位|学习形式|培养形式|专业类别/.test(text)) return "";
    if (/绩点满分|满分绩点|gpa scale|max(?:imum)? gpa|grade scale/.test(text)) return "education.gpaScale";
    if (/专业成绩排名|年级排名|专业排名|成绩排名|class rank|ranking|percentile/.test(text)) return "education.rank";
    if (/学院名称|学院|院系|department|faculty|school of|academic unit/.test(text)) return "education.college";
    if (/学校名称|学校|大学|school|university|institution/.test(text)) return "education.school";
    if (/学历类型|培养类型|教育类型|degree category|education type/.test(text)) return "education.degreeType";
    if (/专业名称|所学专业|major|field of study|discipline|program/.test(text)) return "education.major";
    if (/学历层次|学位层次|学历|学位|degree|qualification/.test(text)) return "education.degree";
    if (/实验室|研究单位|研究中心|laboratory|\blab\b|research (?:unit|center|centre)/.test(text)) return "education.researchUnit";
    if (/导师|advisor|adviser|supervisor|mentor/.test(text)) return "education.advisor";
    if (/研究领域|研究方向|research (?:area|field|interest|focus)/.test(text)) return "education.researchArea";
    if (/毕业论文|学位论文|博士论文|硕士论文|thesis|dissertation/.test(text)) return "education.thesis";
    if (/\bgpa\b|绩点/.test(text)) return "education.gpa";
    const inferred = inferKey(text);
    return inferred?.startsWith("education.") ? inferred : "";
  }

  function educationRecordValue(entry, key) {
    const startDate = normalizedYearMonth(entry?.start_year, entry?.start_month);
    const endDate = normalizedYearMonth(entry?.end_year, entry?.end_month);
    const chinese = pageUsesChinese();
    const degreeAliases = educationDegreeAliases(entry);
    const degreeValue = localizedProfileText(entry?.degree_type || entry?.degree || entry?.degree_en, chinese);
    const schoolValue = chinese
      ? String(entry?.school_zh || localizedProfileText(entry?.school, true)).trim()
      : String(entry?.school || entry?.school_zh || "").trim();
    const values = {
      "education.school": schoolValue,
      "education.college": localizedProfileText(entry?.college, chinese),
      "education.degree": degreeValue,
      "education.degreeType": localizedProfileText(entry?.degree_type, chinese),
      "education.major": localizedProfileText(entry?.major, chinese),
      "education.advisor": entry?.advisor,
      "education.researchUnit": entry?.research_unit,
      "education.gpa": entry?.gpa,
      "education.gpaScale": entry?.gpa_scale,
      "education.rank": entry?.rank,
      "education.researchArea": entry?.research_area,
      "education.thesis": entry?.thesis,
      "education.startDate": startDate,
      "education.endDate": endDate,
    };
    const aliases = key === "education.school" ? [entry?.school_zh, entry?.school]
      : ["education.degree", "education.degreeType"].includes(key) ? degreeAliases
        : key === "education.major" ? [entry?.major, localizedProfileText(entry?.major, !chinese)] : [];
    return { value: String(values[key] || "").trim(), aliases: aliases.filter(Boolean).map(String) };
  }

  async function fillEducationRecords(generalProfile) {
    if (!globalProfileIsAuthoritative(generalProfile)) return { filled: 0, fields: [] };
    const entries = orderedEducationEntries(generalProfile.education);
    const anchors = sectionIdentityControls("education");
    let filled = 0;
    const fields = [];
    for (let index = 0; index < Math.min(entries.length, anchors.length); index += 1) {
      const block = repeatedRecordBlock(anchors[index], "education");
      if (!block) continue;
      for (const el of visibleControls(block)) {
        const key = educationControlKey(el, block);
        if (!key) continue;
        const { value, aliases } = educationRecordValue(entries[index], key);
        if (await fillMappedControl(el, key, value, aliases)) {
          filled += 1;
          fields.push(key);
        }
      }
    }
    if (anchors.length) fields.push("education.recordsBySlot");
    return { filled, fields };
  }

  function employmentControlKey(el, block) {
    if (["checkbox", "radio"].includes(String(el?.type || "").toLowerCase())) return "";
    const directText = directFieldText(el);
    const nearbyText = nearbyLabelText(el);
    const labeledKey = employmentLabelKey(directText) || employmentLabelKey(nearbyText);
    if (labeledKey) return labeledKey;
    const dates = visibleControls(block).filter(dateLikeField);
    if (dateLikeField(el)) {
      const index = dates.indexOf(el);
      if (index === 0) return "employment.startDate";
      if (index === 1) return "employment.endDate";
    }
    if (el instanceof HTMLTextAreaElement) return "employment.description";
    const inferred = inferKey(directText || nearbyText || fieldText(el));
    if (inferred?.startsWith("employment.")) return inferred;
    return semanticSectionKey(el, { section: "employment", node: block });
  }

  async function fillEmploymentRecords(applicationPacket) {
    if (!packetIsAuthoritative(applicationPacket)) return { filled: 0, fields: [] };
    const entries = Array.isArray(applicationPacket.experience) ? applicationPacket.experience : [];
    const anchors = sectionIdentityControls("employment");
    let filled = 0;
    const fields = [];
    for (let index = 0; index < Math.min(entries.length, anchors.length); index += 1) {
      const entry = entries[index];
      const block = repeatedRecordBlock(anchors[index], "employment");
      const controls = repeatedRecordControls(anchors[index], "employment", anchors[index + 1] || null);
      if (!controls.length) continue;
      const startDate = normalizedYearMonth(entry?.start_year, entry?.start_month) || String(entry?.start_date || entry?.start || "").trim();
      const endDate = normalizedYearMonth(entry?.end_year, entry?.end_month) || String(entry?.end_date || entry?.end || "").trim() || (entry?.current ? currentYearMonth() : "");
      const map = {
        "employment.employer": entry?.organization || entry?.employer || entry?.company,
        "employment.title": entry?.title || entry?.role || entry?.position,
        "employment.location": entry?.location,
        "employment.startDate": startDate,
        "employment.endDate": endDate,
        "employment.description": bulletText(entry),
      };
      const semanticNode = block || { querySelectorAll: () => controls };
      for (const el of controls) {
        const key = employmentControlKey(el, semanticNode);
        if (!key) continue;
        const value = String(map[key] || "").trim();
        if (await fillMappedControl(el, key, value)) {
          filled += 1;
          fields.push(key);
        }
      }
    }
    if (anchors.length) fields.push("employment.recordsBySlot");
    return { filled, fields };
  }

  async function fillProjectRecords(applicationPacket) {
    if (!packetIsAuthoritative(applicationPacket)) return { filled: 0, fields: [] };
    const entries = Array.isArray(applicationPacket.projects) ? applicationPacket.projects : [];
    const anchors = sectionIdentityControls("project");
    let filled = 0;
    const fields = [];
    for (let index = 0; index < Math.min(entries.length, anchors.length); index += 1) {
      const entry = entries[index];
      const block = repeatedRecordBlock(anchors[index], "project");
      const controls = repeatedRecordControls(anchors[index], "project", anchors[index + 1] || null);
      if (!controls.length) continue;
      const dates = projectDateRange(entry);
      const map = {
        "project.name": entry.name || entry.title,
        "project.role": entry.role || entry.author_role || entry.contribution || entry.position,
        "project.description": bulletText(entry),
        "project.url": projectUrl(entry),
        "project.startDate": dates.start,
        "project.endDate": dates.end,
      };
      const dateCounters = new Map();
      const semanticNode = block || { querySelectorAll: () => controls };
      for (const el of controls) {
        const directText = directFieldText(el);
        const nearbyText = nearbyLabelText(el) || fieldText(el);
        const keyText = inferKey(directText) ? directText : nearbyText || directText;
        const key = contextualKey(el, keyText, dateCounters, { section: "project", node: semanticNode });
        if (!key?.startsWith("project.")) continue;
        const value = String(map[key] || "").trim();
        if (await fillMappedControl(el, key, value)) {
          filled += 1;
          fields.push(key);
        }
      }
    }
    return { filled, fields };
  }

  async function fillPublicationRecords(generalProfile, profileLanguage = "") {
    if (!hasGlobalPublications(generalProfile)) return { filled: 0, fields: [] };
    const entries = Array.isArray(generalProfile.publications) ? generalProfile.publications : [];
    const anchors = sectionIdentityControls("publication");
    let filled = 0;
    const fields = [];
    for (let index = 0; index < Math.min(entries.length, anchors.length); index += 1) {
      const entry = publicationEntry(entries[index], profileLanguage);
      const block = repeatedRecordBlock(anchors[index], "publication");
      if (!block) continue;
      const map = {
        "publication.title": entry.title,
        "publication.authorOrder": entry.authorOrder,
        "publication.date": entry.date,
        "publication.venue": entry.venue,
        "publication.level": entry.level,
        "publication.jcrQuartile": entry.jcrQuartile,
        "publication.casQuartile": entry.casQuartile,
        "publication.ccfCategory": entry.ccfCategory,
        "publication.details": entry.details,
      };
      for (const el of visibleControls(block)) {
        const directText = directFieldText(el);
        let key = inferKey(directText) || semanticSectionKey(el, { section: "publication", node: block });
        if (key === "publication.venue" && publicationLevelControl(el)) key = "publication.level";
        if (!key?.startsWith("publication.")) continue;
        const value = String(map[key] || "").trim();
        if (["publication.level", "publication.jcrQuartile", "publication.casQuartile", "publication.ccfCategory"].includes(key) && !value) continue;
        const aliases = key === "publication.authorOrder" ? authorshipAliases(value)
          : key === "publication.venue" ? publicationVenueAliases(value) : [];
        if (await fillMappedControl(el, key, value, aliases)) {
          filled += 1;
          fields.push(key);
        }
      }
    }
    return { filled, fields };
  }

  async function fill(profile, generalProfile = null, applicationPacket = null, profileLanguage = "") {
    const desiredRows = {
      publication: Array.isArray(generalProfile?.publications) ? generalProfile.publications.length : 0,
      project: packetIsAuthoritative(applicationPacket) && Array.isArray(applicationPacket.projects) ? applicationPacket.projects.length : 0,
      education: Array.isArray(generalProfile?.education) ? generalProfile.education.length : 0,
      employment: packetIsAuthoritative(applicationPacket) && Array.isArray(applicationPacket.experience) ? applicationPacket.experience.length : 0,
      award: Array.isArray(generalProfile?.awards) ? generalProfile.awards.length : 0,
      language: Array.isArray(generalProfile?.languages) ? generalProfile.languages.length : 0,
      portfolio: Array.isArray(generalProfile?.portfolio) ? generalProfile.portfolio.length : 0,
      campus: Math.max(
        Array.isArray(generalProfile?.campus_experiences) ? generalProfile.campus_experiences.length : 0,
        packetIsAuthoritative(applicationPacket) && Array.isArray(applicationPacket.campus_experiences) ? applicationPacket.campus_experiences.length : 0,
      ),
    };
    const addedRows = {};
    for (const section of ["publication", "project", "education", "employment", "award", "language", "portfolio", "campus"]) {
      addedRows[section] = await ensureRepeatedRows(section, desiredRows[section]);
    }
    const structuredProjectRowsAvailable = sectionIdentityControls("project").length > 0;
    const structuredEmploymentRowsAvailable = sectionIdentityControls("employment").length > 0;
    const elements = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select, [role="combobox"]'));
    const descriptors = elements.map((el) => ({ el, directText: directFieldText(el), text: fieldText(el), sectionInfo: ancestorSectionInfo(el) }));
    let filled = 0;
    const fields = [];
    const skippedSensitive = [];
    const packetCounters = new Map();
    const globalCounters = new Map();
    const generalEntryCounters = new Map();
    const projectDateCounters = new Map();
    for (const [section, count] of Object.entries(addedRows)) {
      if (count) fields.push(`${section}.rowsAdded`);
    }

    for (const { el, directText, text, sectionInfo } of descriptors) {
      if (!text) continue;
      const keyText = inferKey(directText) ? directText : nearbyLabelText(el) || text || directText;
      const explicitSensitiveKey = SENSITIVE_RE.test(keyText) ? confirmedSensitiveKey(keyText) : "";
      if (SENSITIVE_RE.test(keyText) && !explicitSensitiveKey) {
        skippedSensitive.push(text.slice(0, 120));
        continue;
      }
      const key = explicitSensitiveKey || contextualKey(el, keyText, projectDateCounters, sectionInfo);
      const fixedAnswer = key ? "" : fixedAnswerForField(generalProfile, keyText);
      if (!key && !fixedAnswer) continue;
      if (!key && fixedAnswer) {
        const changed = await fillMappedControl(el, "fixed.answer", fixedAnswer, []);
        if (changed) {
          filled += 1;
          fields.push("fixed.answer");
        }
        continue;
      }
      if (globalProfileIsAuthoritative(generalProfile) && key.startsWith("education.")) continue;
      if (hasGlobalPublications(generalProfile) && key.startsWith("publication.")) continue;
      if (packetIsAuthoritative(applicationPacket) && key.startsWith("project.") && structuredProjectRowsAvailable) continue;
      if (packetIsAuthoritative(applicationPacket) && key.startsWith("employment.") && structuredEmploymentRowsAvailable) continue;
      const { value, aliases } = resolveValue(profile, generalProfile, applicationPacket, key, packetCounters, globalCounters, generalEntryCounters, profileLanguage);
      if (!value) continue;
      const changed = await fillMappedControl(el, key, value, aliases);

      if (changed) {
        filled += 1;
        fields.push(key);
      }
    }

    const educationRecords = await fillEducationRecords(generalProfile);
    const publicationRecords = await fillPublicationRecords(generalProfile, profileLanguage);
    const projectRecords = await fillProjectRecords(applicationPacket);
    const employmentRecords = await fillEmploymentRecords(applicationPacket);
    filled += educationRecords.filled + publicationRecords.filled + projectRecords.filled + employmentRecords.filled;
    fields.push(...educationRecords.fields, ...publicationRecords.fields, ...projectRecords.fields, ...employmentRecords.fields);

    const correctedEducationDates = globalProfileIsAuthoritative(generalProfile) ? 0 : await correctEducationPeriods(generalProfile);
    const correctedProjectDates = await correctProjectPeriods(applicationPacket);
    const correctedEmploymentDates = await correctEmploymentPeriods(applicationPacket);
    if (correctedEducationDates) fields.push("education.periodBySchool");
    if (correctedProjectDates) fields.push("project.periodByName");
    if (correctedEmploymentDates) fields.push("employment.periodByEmployer");
    filled += correctedEducationDates + correctedProjectDates + correctedEmploymentDates;

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

  function isVisible(el) {
    if (!el || el.hidden || el.getAttribute?.("aria-hidden") === "true") return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function controlIsEmpty(el) {
    if (el.matches?.('input[type="checkbox"], input[type="radio"]')) {
      const name = el.getAttribute("name");
      const group = name ? Array.from(document.querySelectorAll(`[name="${CSS.escape(name)}"]`)) : [el];
      return !group.some((item) => item.checked);
    }
    if (el.matches?.('input[type="file"]')) return !el.files?.length;
    if (el.getAttribute?.("role") === "combobox") {
      return !String(el.getAttribute("aria-valuetext") || el.textContent || "").trim();
    }
    return !String(el.value || "").trim();
  }

  function applicationFormAudit() {
    const controls = Array.from(document.querySelectorAll(
      'input:not([type="hidden"]), textarea, select, [role="combobox"]',
    )).filter(isVisible);
    const requiredEmpty = [];
    const sensitiveRequired = [];
    const openRequired = [];
    const requiredNonResumeFiles = [];
    for (const el of controls) {
      const required = el.required || el.getAttribute("aria-required") === "true";
      if (!required || !controlIsEmpty(el)) continue;
      const text = fieldText(el).slice(0, 180) || "未标注的必填字段";
      requiredEmpty.push(text);
      if (SENSITIVE_RE.test(text)) sensitiveRequired.push(text);
      if (OPEN_QUESTION_RE.test(text) || el.matches("textarea")) openRequired.push(text);
      if (el.matches('input[type="file"]') && (!RESUME_RE.test(text) || NON_RESUME_FILE_RE.test(text))) {
        requiredNonResumeFiles.push(text);
      }
    }
    const bodyText = normalize(document.body?.innerText?.slice(0, 12000));
    const captcha = Boolean(
      document.querySelector('iframe[src*="captcha" i], iframe[src*="recaptcha" i], iframe[src*="hcaptcha" i], [class*="captcha" i], [id*="captcha" i]')
      || /verify you are human|i am not a robot|captcha|人机验证|验证码/.test(bodyText),
    );
    const submitButtons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
      .filter(isVisible)
      .filter((button) => FINAL_SUBMIT_RE.test(String(button.textContent || button.value || "").trim()))
      .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
    const blockers = [];
    if (captcha) blockers.push("页面包含 CAPTCHA 或人机验证");
    if (sensitiveRequired.length) blockers.push("存在未确认的必填敏感问题");
    if (openRequired.length) blockers.push("存在未回答的必填开放题");
    if (requiredNonResumeFiles.length) blockers.push("存在未上传的必填非简历附件");
    if (requiredEmpty.length) blockers.push(`仍有 ${requiredEmpty.length} 个必填字段为空`);
    if (submitButtons.length !== 1) blockers.push(submitButtons.length ? "页面存在多个最终提交按钮" : "没有找到唯一的最终提交按钮");
    return {
      platform: detectPlatform(),
      blockers: [...new Set(blockers)],
      requiredEmpty: [...new Set(requiredEmpty)].slice(0, 30),
      sensitiveRequired: [...new Set(sensitiveRequired)].slice(0, 20),
      openRequired: [...new Set(openRequired)].slice(0, 20),
      submitButtonCount: submitButtons.length,
      safeToSubmit: blockers.length === 0,
    };
  }

  function openApplicationForm() {
    const candidates = Array.from(document.querySelectorAll('a, button, [role="button"]'))
      .filter(isVisible)
      .filter((element) => APPLICATION_ENTRY_RE.test(String(element.textContent || element.value || "").trim()));
    if (candidates.length !== 1) return { clicked: false, candidates: candidates.length };
    candidates[0].click();
    return { clicked: true, candidates: 1 };
  }

  function clickSafeSubmit() {
    const audit = applicationFormAudit();
    if (!audit.safeToSubmit) return { clicked: false, audit };
    const [button] = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'))
      .filter(isVisible)
      .filter((element) => FINAL_SUBMIT_RE.test(String(element.textContent || element.value || "").trim()));
    if (!button) return { clicked: false, audit };
    button.click();
    return { clicked: true, audit };
  }

  function submissionConfirmation() {
    const text = normalize(document.body?.innerText?.slice(0, 12000));
    const confirmed = /application (?:has been )?(?:submitted|received)|thank you for applying|we have received your application|申请已提交|投递成功|感谢您的申请/.test(text);
    return { confirmed, text: confirmed ? text.slice(0, 500) : "" };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "IVY_FILL_PAGE") {
      chrome.storage.local.get(["ivyProfile"], (result) => {
        window.__ivyLastApplicationPacket = message.applicationPacket || null;
        fill(result.ivyProfile || {}, message.generalProfile || null, message.applicationPacket || null, message.profileLanguage || "")
          .then((payload) => sendResponse({ ok: true, ...payload }))
          .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
      });
      return true;
    }
    if (message?.type === "IVY_REFILL_PROJECT_PERIODS") {
      correctProjectPeriods(message.applicationPacket || window.__ivyLastApplicationPacket || null)
        .then((filled) => sendResponse({ ok: true, filled }))
        .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
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
    if (message?.type === "IVY_OPEN_APPLICATION_FORM") {
      sendResponse({ ok: true, ...openApplicationForm() });
      return false;
    }
    if (message?.type === "IVY_AUDIT_APPLICATION_FORM") {
      sendResponse({ ok: true, ...applicationFormAudit() });
      return false;
    }
    if (message?.type === "IVY_CLICK_SAFE_SUBMIT") {
      sendResponse({ ok: true, ...clickSafeSubmit() });
      return false;
    }
    if (message?.type === "IVY_CONFIRM_SUBMISSION") {
      sendResponse({ ok: true, ...submissionConfirmation() });
      return false;
    }
  });
})();
