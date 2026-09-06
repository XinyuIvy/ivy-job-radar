import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

class FakeField {
  constructor({ id, label, placeholder = "", parentElement, type = "text", readOnly = false }) {
    this.id = id;
    this.name = "";
    this.type = type;
    this.label = label;
    this.parentElement = parentElement;
    this.disabled = false;
    this.readOnly = readOnly;
    this.offsetParent = {};
    this.attributes = new Map([["placeholder", placeholder]]);
    this._value = "";
  }

  get value() { return this._value; }
  set value(value) { this._value = String(value); }
  getAttribute(name) { return this.attributes.get(name) || ""; }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getClientRects() { return [1]; }
  closest() { return null; }
  dispatchEvent() {}
  focus() {}
  blur() {}
  click() {}
}

class FakeInput extends FakeField {
  get value() { return super.value; }
  set value(value) {
    if (!(this instanceof FakeInput)) throw new TypeError("Illegal invocation");
    super.value = value;
  }
}
class TimezoneShiftInput extends FakeInput {
  get value() { return super.value; }
  set value(value) {
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [year, month, day] = text.split("-").map(Number);
      const shifted = new Date(Date.UTC(year, month - 1, day - 1));
      super.value = `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
      return;
    }
    super.value = text;
  }
}
class FakeTextarea extends FakeField {}
class FakeSelect extends FakeField {
  constructor({ options = [], ...rest }) {
    super(rest);
    this.options = options.map((text) => ({ value: text, textContent: text }));
  }
}

class FakeCombobox extends FakeField {
  constructor(options) {
    super(options);
    this.attributes.set("role", "combobox");
  }
}

async function runFill(fields, packet, generalProfile = null, buttons = [], profileLanguage = "", hostname = "example.cn", projectPlacement = "auto", interactiveOptions = []) {
  const body = { tagName: "BODY", textContent: "", innerText: "", parentElement: null };
  let listener;
  const labels = new Map(fields.map((field) => [field.id, { textContent: field.label }]));
  const document = {
    body,
    getElementById: () => null,
    querySelector(selector) {
      const match = selector.match(/^label\[for="(.+)"\]$/);
      return match ? labels.get(match[1]) || null : null;
    },
    querySelectorAll(selector) {
      if (selector.startsWith("button,")) return buttons;
      if (selector.startsWith('[role="option"]')) return interactiveOptions;
      return selector.includes("input:not") ? fields : [];
    },
  };
  const window = {};
  const context = vm.createContext({
    window,
    document,
    location: { hostname },
    CSS: { escape: (value) => value },
    Event: class {},
    File: class {},
    DataTransfer: class {},
    Uint8Array,
    atob,
    setTimeout,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextarea,
    HTMLSelectElement: FakeSelect,
    chrome: {
      runtime: { onMessage: { addListener: (callback) => { listener = callback; } } },
      storage: { local: { get: (_keys, callback) => callback({ ivyProfile: {} }) } },
    },
  });
  const source = await readFile(new URL("../browser-extension/content.js", import.meta.url), "utf8");
  vm.runInContext(source, context);
  return new Promise((resolve) => {
    listener({ type: "IVY_FILL_PAGE", applicationPacket: packet, generalProfile, profileLanguage, projectPlacement }, {}, resolve);
  });
}

test("fills paired project dates and a generic project description", async () => {
  const body = { tagName: "BODY", textContent: "", parentElement: null };
  const projectBlock = {
    tagName: "DIV",
    textContent: "起止时间 项目名称 项目角色 项目链接 描述",
    parentElement: body,
  };
  const start = new FakeInput({ id: "field-1", label: "起止时间", placeholder: "YYYY-MM", parentElement: projectBlock, readOnly: true });
  const end = new FakeInput({ id: "field-2", label: "起止时间", placeholder: "YYYY-MM", parentElement: projectBlock, readOnly: true });
  const name = new FakeInput({ id: "field-name", label: "项目名称", parentElement: projectBlock });
  const role = new FakeInput({ id: "field-3", label: "角色", parentElement: projectBlock });
  const description = new FakeTextarea({ id: "field-7", label: "描述", parentElement: projectBlock });
  projectBlock.querySelectorAll = () => [start, end, name, role, description];
  const packet = {
    authority: "final_customized_cv_only",
    application_id: "APP-2026-ABC-100",
    projects: [{
      name: "真实世界电子病历：30 天再入院风险机器学习模型",
      role: "第一作者",
      start_year: "2026",
      start_month: "5",
      end_year: "2026",
      end_month: "8",
      bullets: ["构建并验证再入院风险模型。", "完成时间外验证。"],
    }],
  };

  const result = await runFill([start, end, name, role, description], packet);

  assert.equal(result.ok, true);
  assert.equal(start.value, "2026-05");
  assert.equal(end.value, "2026-08");
  assert.equal(name.value, "真实世界电子病历：30 天再入院风险机器学习模型");
  assert.equal(role.value, "第一作者");
  assert.equal(description.value, "构建并验证再入院风险模型。\n完成时间外验证。");
  assert.deepEqual(new Set(result.fields), new Set(["project.startDate", "project.endDate", "project.name", "project.role", "project.description"]));
});

test("uses the saved fixed application profile for China contact data and custom stable answers", async () => {
  const body = { tagName: "BODY", textContent: "", parentElement: null };
  const phone = new FakeInput({ id: "fixed-phone", label: "手机号码", parentElement: body });
  const email = new FakeInput({ id: "fixed-email", label: "邮箱", parentElement: body });
  const address = new FakeInput({ id: "fixed-address", label: "家庭住址", parentElement: body });
  const city = new FakeInput({ id: "fixed-city", label: "城市", parentElement: body });
  const travel = new FakeInput({ id: "fixed-travel", label: "Are you willing to travel up to 20 percent?", parentElement: body });
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    fixed_application: {
      defaultRegion: "US",
      identity: { email: "ivy@example.com", usPhone: "+1 615 555 0100", chinaPhone: "+86 138 0000 0000" },
      addresses: {
        us: { address1: "100 West End Ave", city: "Nashville", state: "TN", postalCode: "37203", country: "United States" },
        china: { address1: "人民南路一段 1 号", city: "成都", state: "四川", postalCode: "610000", country: "中国" },
      },
      links: {}, eligibility: {}, application: {},
      fixedAnswers: [{ question: "Are you willing to travel up to 20 percent?", answer: "Yes" }],
    },
  };

  const result = await runFill([phone, email, address, city, travel], null, generalProfile);

  assert.equal(result.ok, true);
  assert.equal(phone.value, "+86 138 0000 0000");
  assert.equal(email.value, "ivy@example.com");
  assert.equal(address.value, "人民南路一段 1 号");
  assert.equal(city.value, "成都");
  assert.equal(travel.value, "Yes");
  assert.equal(result.fields.includes("fixed.answer"), true);
});

test("uses the explicitly selected Chinese or English fixed profile regardless of page host", async () => {
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    fixed_application: {
      defaultLanguage: "zh",
      defaultRegion: "CN",
      identity: {
        firstName: "Xinyu",
        middleName: "Ivy",
        lastName: "Zhang",
        preferredName: "Ivy",
        email: "ivy.en@example.com",
        chineseFullName: "张心语",
        chineseFirstName: "心语",
        chineseLastName: "张",
        chinesePreferredName: "心语",
        chineseEmail: "ivy.zh@example.com",
        usPhone: "+1 615 555 0100",
        chinaPhone: "+86 138 0000 0000",
      },
      addresses: {
        us: { address1: "100 West End Ave", city: "Nashville", state: "TN", postalCode: "37203", country: "United States" },
        china: { address1: "人民南路一段 1 号", city: "成都", state: "四川", postalCode: "610000", country: "中国" },
      },
      links: {}, eligibility: {}, application: {}, fixedAnswers: [],
    },
  };

  const englishBody = { tagName: "BODY", textContent: "", innerText: "", parentElement: null };
  const englishFields = [
    new FakeInput({ id: "en-name", label: "Full name", parentElement: englishBody }),
    new FakeInput({ id: "en-phone", label: "Phone", parentElement: englishBody }),
    new FakeInput({ id: "en-email", label: "Email", parentElement: englishBody }),
    new FakeInput({ id: "en-address", label: "Street address", parentElement: englishBody }),
  ];
  const englishResult = await runFill(englishFields, null, generalProfile, [], "en", "example.cn");
  assert.equal(englishResult.ok, true);
  assert.deepEqual(englishFields.map((field) => field.value), ["Xinyu Ivy Zhang", "+1 615 555 0100", "ivy.en@example.com", "100 West End Ave"]);

  const chineseBody = { tagName: "BODY", textContent: "", innerText: "", parentElement: null };
  const chineseFields = [
    new FakeInput({ id: "zh-name", label: "中文姓名", parentElement: chineseBody }),
    new FakeInput({ id: "zh-phone", label: "手机号码", parentElement: chineseBody }),
    new FakeInput({ id: "zh-email", label: "邮箱", parentElement: chineseBody }),
    new FakeInput({ id: "zh-address", label: "家庭住址", parentElement: chineseBody }),
  ];
  const chineseResult = await runFill(chineseFields, null, generalProfile, [], "zh", "example.com");
  assert.equal(chineseResult.ok, true);
  assert.deepEqual(chineseFields.map((field) => field.value), ["张心语", "+86 138 0000 0000", "ivy.zh@example.com", "人民南路一段 1 号"]);
});

test("adapts a project date range to full-date controls", async () => {
  const body = { tagName: "BODY", textContent: "", parentElement: null };
  const projectBlock = { tagName: "DIV", textContent: "项目经历 起止时间 项目名称 担任角色 项目描述", parentElement: body };
  const start = new FakeInput({ id: "range-start", label: "起止时间", placeholder: "开始日期", parentElement: projectBlock, type: "date", readOnly: true });
  const end = new FakeInput({ id: "range-end", label: "起止时间", placeholder: "结束日期", parentElement: projectBlock, type: "date", readOnly: true });
  const name = new FakeInput({ id: "range-name", label: "项目名称", parentElement: projectBlock });
  const role = new FakeInput({ id: "range-role", label: "担任角色", parentElement: projectBlock });
  projectBlock.querySelectorAll = () => [start, end, name, role];
  const packet = {
    authority: "final_customized_cv_only",
    application_id: "APP-2026-ABC-102",
    projects: [{ name: "真实世界 EHR", role: "第一作者", start_year: "2026", start_month: "05", end_year: "2026", end_month: "08" }],
  };

  const result = await runFill([start, end, name, role], packet);

  assert.equal(result.ok, true);
  assert.equal(start.value, "2026-05-01", JSON.stringify(start.writes));
  assert.equal(end.value, "2026-08-31", JSON.stringify(end.writes));
  assert.equal(role.value, "第一作者");
});

test("uses the current month as the end date for an ongoing project", async () => {
  const body = { tagName: "BODY", textContent: "", parentElement: null };
  const projectBlock = {
    tagName: "DIV",
    textContent: "起止时间 项目名称 项目角色 项目链接 描述",
    parentElement: body,
  };
  const start = new FakeInput({ id: "ongoing-start", label: "起止时间", placeholder: "YYYY-MM", parentElement: projectBlock, readOnly: true });
  const end = new FakeInput({ id: "ongoing-end", label: "起止时间", placeholder: "YYYY-MM", parentElement: projectBlock, readOnly: true });
  const name = new FakeInput({ id: "ongoing-name", label: "项目名称", parentElement: projectBlock });
  projectBlock.querySelectorAll = () => [start, end, name];
  const packet = {
    authority: "final_customized_cv_only",
    application_id: "APP-2026-ABC-101",
    projects: [{
      name: "真实世界电子病历：30 天再入院风险机器学习模型",
      start_year: "2026",
      start_month: "01",
      current: true,
    }],
  };

  const result = await runFill([start, end, name], packet);
  const now = new Date();
  const expectedCurrentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  assert.equal(result.ok, true);
  assert.equal(start.value, "2026-01");
  assert.equal(end.value, expectedCurrentMonth);
  assert.equal(result.fields.includes("project.endDate"), true);
});

test("fills three completely blank education records by slot in the primary pass", async () => {
  const page = { tagName: "DIV", textContent: "教育背景", innerText: "教育背景", parentElement: null };
  const makeBlock = (prefix) => {
    const block = { tagName: "DIV", textContent: "起止时间 学校名称 学院名称 专业名称 学历层次 专业成绩排名 实验室 导师 研究方向", innerText: "教育经历", parentElement: page };
    const start = new FakeInput({ id: `${prefix}-start`, label: "起止时间", placeholder: "开始日期", parentElement: block, type: "date", readOnly: true });
    const end = new FakeInput({ id: `${prefix}-end`, label: "起止时间", placeholder: "结束日期", parentElement: block, type: "date", readOnly: true });
    const school = new FakeInput({ id: `${prefix}-school`, label: "学校名称", parentElement: block });
    const college = new FakeInput({ id: `${prefix}-college`, label: "学院名称", parentElement: block });
    const major = new FakeInput({ id: `${prefix}-major`, label: "专业名称", parentElement: block });
    const degree = new FakeSelect({ id: `${prefix}-degree`, label: "学历层次", parentElement: block, options: ["请选择", "博士", "硕士", "本科"] });
    const rank = new FakeSelect({ id: `${prefix}-rank`, label: "专业成绩排名", parentElement: block, options: ["请选择", "前5%", "前10%"] });
    const unit = new FakeInput({ id: `${prefix}-unit`, label: "实验室", parentElement: block });
    const advisor = new FakeInput({ id: `${prefix}-advisor`, label: "导师", parentElement: block });
    const area = new FakeInput({ id: `${prefix}-area`, label: "研究方向", parentElement: block });
    const fields = [start, end, school, college, major, degree, rank, unit, advisor, area];
    block.querySelectorAll = () => fields;
    return { fields, start, end, school, college, major, degree, rank, unit, advisor, area };
  };
  const first = makeBlock("phd");
  const second = makeBlock("masters");
  const third = makeBlock("bachelors");
  const fields = [first, second, third].flatMap((record) => record.fields);
  const profile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [
      { school_zh: "西南财经大学", college: "统计学院", degree: "统计学学士", degree_type: "本科", major: "统计学", rank: "前5%", research_unit: "统计研究中心", advisor: "吕凤毛", start_year: "2017", start_month: "09", end_year: "2021", end_month: "06" },
      { school_zh: "耶鲁大学", college: "公共卫生学院", degree: "生物统计学硕士", degree_type: "硕士", major: "生物统计学", rank: "前5%", research_unit: "YCAS", advisor: "Wei Wei", research_area: "Survival Analysis", start_year: "2021", start_month: "08", end_year: "2023", end_month: "05" },
      { school_zh: "范德堡大学", college: "医学院", degree: "生物统计学博士", degree_type: "博士", major: "生物统计学", rank: "前10%", research_unit: "VUMC", advisor: "Simon Vandekar", research_area: "Semiparametric statistical inference", start_year: "2023", start_month: "08", end_year: "2027", end_month: "05" },
    ],
  };

  const result = await runFill(fields, null, profile);

  assert.equal(result.ok, true);
  assert.deepEqual([first.school.value, first.degree.value, first.major.value, first.start.value, first.end.value], ["范德堡大学", "博士", "生物统计学", "2023-08-01", "2027-05-31"]);
  assert.deepEqual([first.college.value, first.rank.value, first.unit.value, first.advisor.value], ["医学院", "前10%", "VUMC", "Simon Vandekar"]);
  assert.deepEqual([second.school.value, second.degree.value, second.major.value, second.start.value, second.end.value], ["耶鲁大学", "硕士", "生物统计学", "2021-08-01", "2023-05-31"]);
  assert.deepEqual([second.college.value, second.rank.value, second.unit.value, second.advisor.value, second.area.value], ["公共卫生学院", "前5%", "YCAS", "Wei Wei", "Survival Analysis"]);
  assert.deepEqual([third.school.value, third.degree.value, third.major.value, third.start.value, third.end.value], ["西南财经大学", "本科", "统计学", "2017-09-01", "2021-06-30"]);
  assert.deepEqual([third.college.value, third.rank.value, third.unit.value, third.advisor.value], ["统计学院", "前5%", "统计研究中心", "吕凤毛"]);
  assert.equal(result.fields.includes("education.recordsBySlot"), true);
});

test("preserves manually entered values and fills only blank education controls", async () => {
  const page = { tagName: "DIV", textContent: "教育背景", innerText: "教育背景", parentElement: null };
  const block = { tagName: "DIV", textContent: "起止时间 学校名称 学院名称 专业名称 学历层次 导师", innerText: "教育经历", parentElement: page };
  const start = new FakeInput({ id: "manual-start", label: "起止时间", placeholder: "YYYY-MM", parentElement: block, readOnly: true });
  const end = new FakeInput({ id: "manual-end", label: "起止时间", placeholder: "YYYY-MM", parentElement: block, readOnly: true });
  const school = new FakeInput({ id: "manual-school", label: "学校名称", parentElement: block });
  const college = new FakeInput({ id: "manual-college", label: "学院名称", parentElement: block });
  const major = new FakeInput({ id: "manual-major", label: "专业名称", parentElement: block });
  const degree = new FakeSelect({ id: "manual-degree", label: "学历层次", parentElement: block, options: ["请选择", "博士", "硕士", "本科"] });
  const advisor = new FakeInput({ id: "manual-advisor", label: "导师", parentElement: block });
  const fields = [start, end, school, college, major, degree, advisor];
  block.querySelectorAll = () => fields;
  start.value = "2024-01";
  school.value = "我手动填写的学校";
  advisor.value = "我手动填写的导师";
  const profile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [{ school_zh: "范德堡大学", college: "医学院", degree_type: "博士", major: "生物统计学", advisor: "Simon Vandekar", start_year: "2023", start_month: "08", end_year: "2027", end_month: "05" }],
  };

  const result = await runFill(fields, null, profile);

  assert.equal(result.ok, true);
  assert.equal(start.value, "2024-01");
  assert.equal(school.value, "我手动填写的学校");
  assert.equal(advisor.value, "我手动填写的导师");
  assert.equal(end.value, "2027-05");
  assert.equal(college.value, "医学院");
  assert.equal(major.value, "生物统计学");
  assert.equal(degree.value, "博士");
});

test("fills two languages, awards, and portfolio entries from the global profile", async () => {
  const body = { tagName: "BODY", textContent: "", parentElement: null };
  const languageBlock = { tagName: "DIV", textContent: "语言能力 语言 精通程度", parentElement: body };
  const awardBlockA = { tagName: "DIV", textContent: "获奖时间 获奖名称 描述", parentElement: body };
  const awardBlockB = { tagName: "DIV", textContent: "获奖时间 获奖名称 描述", parentElement: body };
  const portfolioBlockA = { tagName: "DIV", textContent: "作品链接 作品附件 描述", parentElement: body };
  const portfolioBlockB = { tagName: "DIV", textContent: "作品链接 作品附件 描述", parentElement: body };
  const fields = [
    new FakeSelect({ id: "lang-1", label: "语言", parentElement: languageBlock, options: ["请选择", "普通话", "英语"] }),
    new FakeSelect({ id: "lang-2", label: "语言", parentElement: languageBlock, options: ["请选择", "普通话", "英语"] }),
    new FakeInput({ id: "award-year-1", label: "获奖时间", parentElement: awardBlockA, placeholder: "YYYY", readOnly: true }),
    new FakeInput({ id: "award-name-1", label: "获奖名称", parentElement: awardBlockA }),
    new FakeTextarea({ id: "award-desc-1", label: "描述", parentElement: awardBlockA }),
    new FakeInput({ id: "award-year-2", label: "获奖时间", parentElement: awardBlockB, placeholder: "YYYY", readOnly: true }),
    new FakeInput({ id: "award-name-2", label: "获奖名称", parentElement: awardBlockB }),
    new FakeTextarea({ id: "award-desc-2", label: "描述", parentElement: awardBlockB }),
    new FakeInput({ id: "portfolio-url-1", label: "作品链接", parentElement: portfolioBlockA }),
    new FakeTextarea({ id: "portfolio-desc-1", label: "描述", parentElement: portfolioBlockA }),
    new FakeInput({ id: "portfolio-url-2", label: "作品链接", parentElement: portfolioBlockB }),
    new FakeTextarea({ id: "portfolio-desc-2", label: "描述", parentElement: portfolioBlockB }),
  ];
  languageBlock.querySelectorAll = () => fields.slice(0, 2);
  awardBlockA.querySelectorAll = () => fields.slice(2, 5);
  awardBlockB.querySelectorAll = () => fields.slice(5, 8);
  portfolioBlockA.querySelectorAll = () => fields.slice(8, 10);
  portfolioBlockB.querySelectorAll = () => fields.slice(10, 12);
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    languages: [
      { language: "中文", aliases: ["普通话", "Chinese", "Mandarin"] },
      { language: "英语", aliases: ["English"] },
    ],
    awards: [
      { year: "2026", name: "Vanderbilt University Provost's Pathbreaking Discovery Award", description: "个人奖。" },
      { year: "2026", name: "NIH Replication Prize", description: "四人团队获奖成员。" },
    ],
    portfolio: [
      { url: "https://github.com/XinyuIvy/ai-usage-check", description: "AI Usage Dashboard" },
      { url: "https://github.com/XinyuIvy/ivy-job-radar", description: "Ivy Job Radar" },
    ],
  };

  const result = await runFill(fields, null, generalProfile);

  assert.equal(result.ok, true);
  assert.equal(fields[0].value, "普通话");
  assert.equal(fields[1].value, "英语");
  assert.equal(fields[2].value, "2026");
  assert.equal(fields[3].value, "Vanderbilt University Provost's Pathbreaking Discovery Award");
  assert.equal(fields[4].value, "个人奖。");
  assert.equal(fields[5].value, "2026");
  assert.equal(fields[6].value, "NIH Replication Prize");
  assert.equal(fields[8].value, "https://github.com/XinyuIvy/ai-usage-check");
  assert.equal(fields[9].value, "AI Usage Dashboard");
  assert.equal(fields[10].value, "https://github.com/XinyuIvy/ivy-job-radar");
  assert.equal(fields[11].value, "Ivy Job Radar");
});

test("infers award and publication fields from section structure instead of exact labels", async () => {
  const body = { tagName: "BODY", textContent: "", parentElement: null };
  const awardBlock = { tagName: "DIV", textContent: "荣誉奖励 分类 日期 说明", parentElement: body };
  const publicationBlock = { tagName: "DIV", textContent: "论文/期刊 题名 排序 日期 来源 说明", parentElement: body };
  const awardType = new FakeSelect({ id: "award-category", label: "分类", parentElement: awardBlock, options: ["请选择", "个人奖", "团队奖", "其他"] });
  const awardDate = new FakeInput({ id: "award-date", label: "日期", placeholder: "请选择日期", parentElement: awardBlock, type: "date", readOnly: true });
  const awardDetails = new FakeTextarea({ id: "award-details", label: "说明", parentElement: awardBlock });
  awardBlock.querySelectorAll = () => [awardType, awardDate, awardDetails];
  const paperTitle = new FakeInput({ id: "paper-title", label: "题名", parentElement: publicationBlock });
  const authorOrder = new FakeSelect({ id: "paper-order", label: "排序", parentElement: publicationBlock, options: ["请选择", "第一作者", "共同作者"] });
  const publicationDate = new FakeInput({ id: "paper-date", label: "日期", placeholder: "请选择日期", parentElement: publicationBlock, type: "date", readOnly: true });
  const venue = new FakeSelect({ id: "paper-source", label: "来源", parentElement: publicationBlock, options: ["请选择", "期刊", "会议", "其他"] });
  const paperDetails = new FakeTextarea({ id: "paper-details", label: "说明", parentElement: publicationBlock });
  publicationBlock.querySelectorAll = () => [paperTitle, authorOrder, publicationDate, venue, paperDetails];
  const packet = {
    authority: "final_customized_cv_only",
    application_id: "APP-2026-ABC-103",
    publications: [{
      title: "Semiparametric confidence sets for cross-sectional and longitudinal neuroimaging",
      author_order: "First Author",
      publication_date: "2025-06",
      venue: "Imaging Neuroscience",
      details: "同行评议期刊论文。",
    }],
  };
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    awards: [{ year: "2026", name: "Pathbreaking Discovery Award", description: "个人研究奖。" }],
  };

  const result = await runFill([awardType, awardDate, awardDetails, paperTitle, authorOrder, publicationDate, venue, paperDetails], packet, generalProfile);

  assert.equal(result.ok, true);
  assert.equal(awardType.value, "个人奖");
  assert.equal(awardDate.value, "2026-01-01");
  assert.equal(awardDetails.value, "Pathbreaking Discovery Award：个人研究奖。");
  assert.equal(paperTitle.value, "Semiparametric confidence sets for cross-sectional and longitudinal neuroimaging");
  assert.equal(authorOrder.value, "第一作者");
  assert.equal(publicationDate.value, "2025-06-01");
  assert.equal(venue.value, "期刊");
  assert.equal(paperDetails.value, "同行评议期刊论文。");
});

test("infers an employment block from structure when labels use unfamiliar synonyms", async () => {
  const body = { tagName: "BODY", textContent: "", parentElement: null };
  const workBlock = { tagName: "DIV", textContent: "工作经历 任职单位 岗位 所在地 开始日期 结束日期 主要事项", parentElement: body };
  const employer = new FakeInput({ id: "work-org", label: "任职单位", parentElement: workBlock });
  const title = new FakeInput({ id: "work-role", label: "岗位", parentElement: workBlock });
  const location = new FakeInput({ id: "work-place", label: "所在地", parentElement: workBlock });
  const start = new FakeInput({ id: "work-start", label: "开始", placeholder: "开始日期", parentElement: workBlock, type: "date", readOnly: true });
  const end = new FakeInput({ id: "work-end", label: "结束", placeholder: "结束日期", parentElement: workBlock, type: "date", readOnly: true });
  const description = new FakeTextarea({ id: "work-details", label: "主要事项", parentElement: workBlock });
  workBlock.querySelectorAll = () => [employer, title, location, start, end, description];
  const packet = {
    authority: "final_customized_cv_only",
    application_id: "APP-2026-ABC-104",
    experience: [{
      organization: "Vanderbilt University Medical Center",
      title: "Biostatistics Intern",
      location: "Nashville, United States",
      start_year: "2025",
      start_month: "05",
      end_year: "2025",
      end_month: "08",
      bullets: ["支持真实世界临床研究分析。"],
    }],
  };

  const result = await runFill([employer, title, location, start, end, description], packet);

  assert.equal(result.ok, true);
  assert.equal(employer.value, "Vanderbilt University Medical Center");
  assert.equal(title.value, "Biostatistics Intern");
  assert.equal(location.value, "Nashville, United States");
  assert.equal(start.value, "2025-05-01");
  assert.equal(end.value, "2025-08-31");
  assert.equal(description.value, "支持真实世界临床研究分析。");
});

test("fills a Workday employment row from the CV master frozen with the saved job", async () => {
  const body = { tagName: "BODY", textContent: "", parentElement: null };
  const workBlock = {
    tagName: "DIV",
    textContent: "Work Experience Job Title Company Location I currently work here From To Role Description Add Another",
    parentElement: body,
  };
  const title = new FakeInput({ id: "jobTitle", label: "Job Title", parentElement: workBlock });
  const company = new FakeInput({ id: "company", label: "Company", parentElement: workBlock });
  const location = new FakeInput({ id: "location", label: "Location", parentElement: workBlock });
  const current = new FakeInput({ id: "currentlyWorkHere", label: "I currently work here", parentElement: workBlock, type: "checkbox" });
  const start = new FakeInput({ id: "startDate", label: "From", placeholder: "MM/YYYY", parentElement: workBlock });
  const end = new FakeInput({ id: "endDate", label: "To", placeholder: "MM/YYYY", parentElement: workBlock });
  const description = new FakeTextarea({ id: "roleDescription", label: "Role Description", parentElement: workBlock });
  workBlock.querySelectorAll = () => [title, company, location, current, start, end, description];
  const packet = {
    authority: "final_customized_cv_only",
    provenance: "frozen_submitted_template",
    application_id: "APP-2026-IQV-0130",
    experience: [{
      organization: "Pfizer",
      title: "Statistics Intern, Statistical Inflammation and Immunology",
      location: "Boston, MA",
      start_year: "2026",
      start_month: "05",
      end_year: "2026",
      end_month: "08",
      bullets: ["Built a configurable clinical-trial simulation workflow.", "Evaluated operating characteristics with Monte Carlo experiments."],
    }],
  };

  const result = await runFill([title, company, location, current, start, end, description], packet, null, [], "en", "iqvia.wd3.myworkdayjobs.com");

  assert.equal(result.ok, true);
  assert.equal(title.value, "Statistics Intern, Statistical Inflammation and Immunology");
  assert.equal(company.value, "Pfizer");
  assert.equal(location.value, "Boston, MA");
  assert.equal(current.value, "");
  assert.equal(start.value, "05/2026");
  assert.equal(end.value, "08/2026");
  assert.equal(description.value, "Built a configurable clinical-trial simulation workflow.\nEvaluated operating characteristics with Monte Carlo experiments.");
  assert.equal(result.fields.includes("employment.recordsBySlot"), true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.sourceRecords)), { experience: 1, projects: 0, education: 0, skills: 0 });
});

test("routes every project into Workday work experience when no project section exists", async () => {
  const body = { tagName: "BODY", textContent: "Work Experience Add Another", parentElement: null };
  const makeRow = (index) => {
    const block = {
      tagName: "DIV",
      textContent: `Work Experience ${index + 1} Job Title Company Location Job Type From To Role Description`,
      parentElement: body,
    };
    const title = new FakeInput({ id: `route-title-${index}`, label: "Job Title", parentElement: block });
    const company = new FakeInput({ id: `route-company-${index}`, label: "Company", parentElement: block });
    const location = new FakeInput({ id: `route-location-${index}`, label: "Location", parentElement: block });
    const type = new FakeSelect({ id: `route-type-${index}`, label: "Job Type", parentElement: block, options: ["Select One", "Full-time", "Part-time"] });
    const start = new FakeInput({ id: `route-start-${index}`, label: "From", placeholder: "MM/YYYY", parentElement: block });
    const end = new FakeInput({ id: `route-end-${index}`, label: "To", placeholder: "MM/YYYY", parentElement: block });
    const description = new FakeTextarea({ id: `route-description-${index}`, label: "Role Description", parentElement: block });
    const controls = [title, company, location, type, start, end, description];
    block.querySelectorAll = () => controls;
    return { controls, title, company, type, start, end, description };
  };
  const rows = [makeRow(0), makeRow(1), makeRow(2)];
  rows[1].start.value = "12/2026";
  const fields = rows.flatMap((row) => row.controls);
  const packet = {
    authority: "final_customized_cv_only",
    provenance: "frozen_submitted_template",
    application_id: "APP-2026-IQV-0131",
    experience: [{
      organization: "Pfizer",
      title: "Biostatistics Intern",
      start_year: "2025",
      start_month: "05",
      end_year: "2025",
      end_month: "08",
      bullets: ["Supported clinical trial analyses."],
    }],
    projects: [{
      name: "Longitudinal EHR Phenotyping",
      start_year: "2024",
      start_month: "01",
      end_year: "2024",
      end_month: "11",
      bullets: ["Built and validated a longitudinal phenotype pipeline."],
    }, {
      name: "Clinical Imaging Biomarkers",
      organization: "Vanderbilt University Medical Center",
      start_year: "2025",
      start_month: "02",
      end_year: "2025",
      end_month: "12",
      bullets: ["Evaluated imaging biomarkers in clinical cohorts."],
    }],
  };
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [{
      school: "Vanderbilt University",
      school_zh: "范德堡大学",
      start_year: "2022",
      start_month: "08",
      end_year: "2027",
      end_month: "05",
      degree: "PhD in Biostatistics",
    }],
  };

  const result = await runFill(fields, packet, generalProfile, [], "en", "example.myworkdayjobs.com");

  assert.equal(result.ok, true);
  assert.equal(result.projectRouting, "employment");
  assert.equal(rows[0].title.value, "Biostatistics Intern");
  assert.equal(rows[0].company.value, "Pfizer");
  assert.equal(rows[1].title.value, "Longitudinal EHR Phenotyping");
  assert.equal(rows[1].company.value, "Vanderbilt University");
  assert.equal(rows[1].type.value, "Part-time");
  assert.equal(rows[1].start.value, "01/2024");
  assert.equal(rows[1].end.value, "11/2024");
  assert.equal(rows[1].description.value, "Built and validated a longitudinal phenotype pipeline.");
  assert.equal(rows[2].title.value, "Clinical Imaging Biomarkers");
  assert.equal(rows[2].company.value, "Vanderbilt University Medical Center");
  assert.equal(rows[2].type.value, "Part-time");
  assert.equal(result.fields.includes("project.rowsAdded"), false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.sourceRecords)), { experience: 1, projects: 2, education: 1, skills: 0 });
});

test("marks a routed project as Chinese part-time when Chinese profile is selected", async () => {
  const body = { tagName: "BODY", textContent: "工作经历", parentElement: null };
  const block = { tagName: "DIV", textContent: "工作经历 职位名称 公司名称 工作类型 工作描述", parentElement: body };
  const title = new FakeInput({ id: "zh-route-title", label: "职位名称", parentElement: block });
  const company = new FakeInput({ id: "zh-route-company", label: "公司名称", parentElement: block });
  const type = new FakeSelect({ id: "zh-route-type", label: "工作类型", parentElement: block, options: ["请选择", "全职", "兼职"] });
  const description = new FakeTextarea({ id: "zh-route-description", label: "工作描述", parentElement: block });
  block.querySelectorAll = () => [title, company, type, description];
  const packet = {
    authority: "final_customized_cv_only",
    application_id: "APP-2026-CN-0001",
    projects: [{ name: "临床数据研究", organization: "范德堡大学", bullets: ["完成纵向临床数据分析。"] }],
  };

  const result = await runFill([title, company, type, description], packet, null, [], "zh", "example.cn");

  assert.equal(result.ok, true);
  assert.equal(result.projectRouting, "employment");
  assert.equal(title.value, "临床数据研究");
  assert.equal(company.value, "范德堡大学");
  assert.equal(type.value, "兼职");
  assert.equal(description.value, "完成纵向临床数据分析。");
});

test("adds enough work experience rows before routing all projects", async () => {
  const body = { tagName: "BODY", textContent: "Work Experience Add Another", parentElement: null };
  const section = { tagName: "DIV", textContent: "Work Experience Job Title Company Job Type Role Description Add Another", parentElement: body };
  const makeRow = (index) => {
    const block = { tagName: "DIV", textContent: `Work Experience ${index + 1} Job Title Company Job Type Role Description`, parentElement: section };
    const title = new FakeInput({ id: `added-title-${index}`, label: "Job Title", parentElement: block });
    const company = new FakeInput({ id: `added-company-${index}`, label: "Company", parentElement: block });
    const type = new FakeSelect({ id: `added-type-${index}`, label: "Job Type", parentElement: block, options: ["Select One", "Full-time", "Part-time"] });
    const description = new FakeTextarea({ id: `added-description-${index}`, label: "Role Description", parentElement: block });
    const controls = [title, company, type, description];
    block.querySelectorAll = () => controls;
    return { controls, title, company, type, description };
  };
  const rows = [makeRow(0), makeRow(1)];
  for (const field of rows[1].controls) {
    field.offsetParent = null;
    field.getClientRects = () => [];
  }
  const allFields = rows.flatMap((row) => row.controls);
  section.querySelectorAll = () => allFields;
  const addButton = {
    textContent: "Add Another", value: "", parentElement: section, offsetParent: {},
    getClientRects: () => [1],
    click() {
      for (const field of rows[1].controls) {
        field.offsetParent = {};
        field.getClientRects = () => [1];
      }
    },
  };
  const packet = {
    authority: "final_customized_cv_only",
    application_id: "APP-2026-US-0002",
    projects: [
      { name: "Project One", organization: "Vanderbilt University", bullets: ["First project details."] },
      { name: "Project Two", organization: "Vanderbilt University", bullets: ["Second project details."] },
    ],
  };

  const result = await runFill(allFields, packet, null, [addButton], "en", "example.myworkdayjobs.com");

  assert.equal(result.ok, true);
  assert.equal(rows[0].title.value, "Project One");
  assert.equal(rows[1].title.value, "Project Two");
  assert.equal(rows[1].type.value, "Part-time");
  assert.equal(result.fields.includes("employment.rowsAdded"), true);
});

test("fills a standard Skills text area from every selected CV skill category", async () => {
  const body = { tagName: "BODY", textContent: "Technical Skills", parentElement: null };
  const block = { tagName: "DIV", textContent: "Technical Skills", parentElement: body };
  const skills = new FakeTextarea({ id: "skills-text", label: "Technical Skills", parentElement: block });
  block.querySelectorAll = () => [skills];
  const packet = {
    authority: "live_cv_template",
    application_id: "TEMPLATE:CV_RWE_AI_EN.tex",
    skills: [
      { category: "Programming", items: ["R", "Python", "SQL"] },
      { category: "Statistics", items: ["GEE", "Survival analysis"] },
    ],
  };

  const result = await runFill([skills], packet, null, [], "en", "example.com");

  assert.equal(result.ok, true);
  assert.equal(skills.value, "R, Python, SQL, GEE, Survival analysis");
  assert.equal(result.sourceRecords.skills, 5);
  assert.equal(result.fields.includes("cv.skills"), true);
});

test("adds CV skills individually through a Workday-style skill combobox", async () => {
  const body = { tagName: "BODY", textContent: "Skills", parentElement: null };
  const block = { tagName: "DIV", textContent: "Skills Search for a skill", parentElement: body };
  const picker = new FakeCombobox({ id: "skills-picker", label: "Skills", placeholder: "Search for a skill", parentElement: block });
  block.querySelectorAll = () => [picker];
  const selected = [];
  const options = ["R", "Python", "Survival Analysis"].map((text) => ({
    textContent: text,
    offsetParent: {},
    getClientRects: () => [1],
    click() {
      selected.push(text);
      picker.value = "";
    },
  }));
  const packet = {
    authority: "live_cv_template",
    application_id: "TEMPLATE:CV_RWE_AI_EN.tex",
    skills: [{ category: "Selected CV Skills", items: ["R", "Python", "Survival analysis"] }],
  };

  const result = await runFill([picker], packet, null, [], "en", "example.myworkdayjobs.com", "auto", options);

  assert.equal(result.ok, true);
  assert.deepEqual(selected, ["R", "Python", "Survival Analysis"]);
  assert.equal(result.fields.includes("cv.skillRecords"), true);
  assert.equal(result.sourceRecords.skills, 3);
});

test("honors the explicit English profile and replaces known Chinese education translations", async () => {
  const body = { tagName: "BODY", textContent: "教育 Education", innerText: "教育 Education", parentElement: null };
  const block = { tagName: "DIV", textContent: "Education School or University Field of Study", parentElement: body };
  const school = new FakeInput({ id: "school", label: "School or University", parentElement: block });
  const major = new FakeInput({ id: "major", label: "Field of Study", parentElement: block });
  school.value = "范德堡大学";
  major.value = "生物统计学";
  block.querySelectorAll = () => [school, major];
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [{
      school: "Vanderbilt University",
      school_zh: "范德堡大学",
      major: "Biostatistics / 生物统计学",
      degree: "PhD in Biostatistics",
    }],
  };

  const result = await runFill([school, major], null, generalProfile, [], "en", "iqvia.wd1.myworkdayjobs.com");

  assert.equal(result.ok, true);
  assert.equal(school.value, "Vanderbilt University");
  assert.equal(major.value, "Biostatistics");
});

test("does not invoke an input value setter on a div-based combobox", async () => {
  const body = { tagName: "BODY", textContent: "", parentElement: null };
  const languageBlock = { tagName: "DIV", textContent: "语言能力 语言 熟练程度", parentElement: body };
  const combobox = new FakeCombobox({ id: "language-combobox", label: "语言", parentElement: languageBlock });
  languageBlock.querySelectorAll = () => [combobox];
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    languages: [{ language: "中文", aliases: ["普通话", "Chinese", "Mandarin"] }],
  };

  const result = await runFill([combobox], null, generalProfile);

  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
});

test("keeps awards out of work descriptions and compensates one-day date shifts", async () => {
  const body = { tagName: "BODY", textContent: "工作经历 荣誉奖励", parentElement: null };
  const workBlock = { tagName: "DIV", textContent: "实习经历 起止时间 公司名称 职位名称 工作描述", parentElement: body };
  const awardBlock = { tagName: "DIV", textContent: "荣誉奖励 获奖时间 获奖情况", parentElement: body };
  const start = new TimezoneShiftInput({ id: "pfizer-start", label: "起止时间", placeholder: "开始日期", parentElement: workBlock, type: "date", readOnly: true });
  const end = new TimezoneShiftInput({ id: "pfizer-end", label: "起止时间", placeholder: "结束日期", parentElement: workBlock, type: "date", readOnly: true });
  const employer = new FakeInput({ id: "pfizer-employer", label: "公司名称", parentElement: workBlock });
  const title = new FakeInput({ id: "pfizer-title", label: "职位名称", parentElement: workBlock });
  const workDescription = new FakeTextarea({ id: "pfizer-description", label: "工作描述", parentElement: workBlock });
  const awardDate = new FakeInput({ id: "award-date-separated", label: "获奖时间", placeholder: "请选择日期", parentElement: awardBlock, type: "date", readOnly: true });
  const awardDescription = new FakeTextarea({ id: "award-description-separated", label: "获奖情况", parentElement: awardBlock });
  workBlock.querySelectorAll = () => [start, end, employer, title, workDescription];
  awardBlock.querySelectorAll = () => [awardDate, awardDescription];
  const packet = {
    authority: "final_customized_cv_only",
    application_id: "APP-2026-1XC-0040",
    experience: [{
      organization: "辉瑞（Pfizer）",
      title: "统计实习生",
      start_year: "2026", start_month: "05", end_year: "2026", end_month: "08",
      bullets: ["搭建可配置的双臂临床试验模拟与终点评价流程。", "结合负二项模型与 Monte Carlo 模拟开展敏感性分析。"],
    }],
  };
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    awards: [{ year: "2026", name: "Pathbreaking Discovery Award", description: "个人奖。" }],
  };

  const result = await runFill([start, end, employer, title, workDescription, awardDate, awardDescription], packet, generalProfile);

  assert.equal(result.ok, true);
  assert.equal(start.value, "2026-05-01");
  assert.equal(end.value, "2026-08-31");
  assert.equal(workDescription.value, "搭建可配置的双臂临床试验模拟与终点评价流程。\n结合负二项模型与 Monte Carlo 模拟开展敏感性分析。");
  assert.equal(workDescription.value.includes("Award"), false);
  assert.equal(awardDescription.value.includes("Pathbreaking Discovery Award"), true);
  assert.equal(result.fields.includes("employment.startDate"), true);
});

test("fills only explicitly confirmed identity fields including sensitive date and ethnicity", async () => {
  const body = { tagName: "BODY", textContent: "个人信息", parentElement: null };
  const phone = new FakeInput({ id: "phone", label: "手机号码", parentElement: body });
  const nativePlace = new FakeInput({ id: "native-place", label: "籍贯", parentElement: body });
  const birthPlace = new FakeInput({ id: "birth-place", label: "出生地", parentElement: body });
  const gender = new FakeSelect({ id: "gender", label: "性别", parentElement: body, options: ["请选择", "女", "男"] });
  const ethnicity = new FakeSelect({ id: "ethnicity", label: "民族", parentElement: body, options: ["请选择", "汉族", "其他"] });
  const birthDate = new FakeInput({ id: "birth-date", label: "出生日期", placeholder: "请选择日期", parentElement: body, type: "date", readOnly: true });
  const wechat = new FakeInput({ id: "wechat", label: "微信号", parentElement: body });
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    identity: { phone: "15840470437", native_place: "四川省成都市", birth_place: "辽宁省沈阳市", gender: "女", ethnicity: "汉族", date_of_birth: "1999-01-11", wechat: "ivyzzzhang" },
  };

  const result = await runFill([phone, nativePlace, birthPlace, gender, ethnicity, birthDate, wechat], null, generalProfile);

  assert.equal(result.ok, true);
  assert.deepEqual(
    [phone.value, nativePlace.value, birthPlace.value, gender.value, ethnicity.value, birthDate.value, wechat.value],
    ["15840470437", "四川省成都市", "辽宁省沈阳市", "女", "汉族", "1999-01-11", "ivyzzzhang"],
  );
});

test("prefers the complete global publication list over APP-selected publications", async () => {
  const body = { tagName: "BODY", textContent: "论文/期刊", parentElement: null };
  const blocks = [0, 1].map((index) => {
    const block = { tagName: "DIV", textContent: "论文/期刊 论文名称 作者顺序 发表时间 刊物/机构 论文详情", parentElement: body };
    const title = new FakeInput({ id: `global-paper-title-${index}`, label: "论文名称", parentElement: block });
    const author = new FakeSelect({ id: `global-paper-author-${index}`, label: "作者顺序", parentElement: block, options: ["请选择", "第一作者", "第二作者", "共同作者"] });
    const date = new FakeInput({ id: `global-paper-date-${index}`, label: "发表时间", placeholder: "YYYY", parentElement: block });
    const venue = new FakeSelect({ id: `global-paper-venue-${index}`, label: "刊物/机构", parentElement: block, options: ["请选择", "期刊", "会议", "其他"] });
    const details = new FakeTextarea({ id: `global-paper-details-${index}`, label: "论文详情", parentElement: block });
    block.querySelectorAll = () => [title, author, date, venue, details];
    return { title, author, date, venue, details };
  });
  const fields = blocks.flatMap((block) => [block.title, block.author, block.date, block.venue, block.details]);
  const packet = { authority: "final_customized_cv_only", application_id: "APP-2026-ABC-200", publications: [{ title: "APP-only paper" }] };
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    publications: [
      { title: "Published paper", author_order_zh: "第一作者", author_order_en: "First Author", year: "2025", venue: "Imaging Neuroscience", best_verified_rank: "JCR Q2", jcr_quartile: "JCR Q2", description_zh: "中文论文说明。", description_en: "English paper description.", status: "Published" },
      { title: "Preprint paper", author_order_zh: "第二作者", author_order_en: "Second Author", year: "2026", venue: "Psychometrika", best_verified_rank: "JCR Q1", jcr_quartile: "JCR Q1", description_zh: "中文预印本说明。", description_en: "English preprint description.", status: "Preprint; under review" },
    ],
  };

  const result = await runFill(fields, packet, generalProfile, [], "zh");

  assert.equal(result.ok, true);
  assert.equal(blocks[0].title.value, "Published paper");
  assert.equal(blocks[1].title.value, "Preprint paper");
  assert.equal(blocks[0].author.value, "第一作者");
  assert.equal(blocks[1].author.value, "第二作者");
  assert.equal(blocks[0].date.value, "2025");
  assert.equal(blocks[1].date.value, "2026");
  assert.equal(blocks[0].details.value.includes("中文论文说明。"), true);
  assert.equal(blocks[0].details.value.includes("English paper description."), false);
});

test("uses bilingual publication details and separate verified ranking fields", async () => {
  const body = { tagName: "BODY", textContent: "论文/期刊", parentElement: null };
  const block = { tagName: "DIV", textContent: "论文/期刊 论文名称 作者顺序 发表时间 刊物/机构 论文等级 JCR 分区 中科院分区 CCF 等级 论文详情", parentElement: body };
  const title = new FakeInput({ id: "ranked-paper-title", label: "论文名称", parentElement: block });
  const author = new FakeSelect({ id: "ranked-paper-author", label: "作者顺序", parentElement: block, options: ["请选择", "第一作者", "第二作者"] });
  const date = new FakeInput({ id: "ranked-paper-date", label: "发表时间", placeholder: "YYYY", parentElement: block });
  const venue = new FakeSelect({ id: "ranked-paper-venue", label: "刊物/机构", parentElement: block, options: ["请选择", "期刊", "会议"] });
  const bestRank = new FakeInput({ id: "ranked-paper-best", label: "论文等级", parentElement: block });
  const jcr = new FakeInput({ id: "ranked-paper-jcr", label: "JCR 分区", parentElement: block });
  const cas = new FakeInput({ id: "ranked-paper-cas", label: "中科院分区", parentElement: block });
  const ccf = new FakeInput({ id: "ranked-paper-ccf", label: "CCF 等级", parentElement: block });
  const details = new FakeTextarea({ id: "ranked-paper-details", label: "论文详情", parentElement: block });
  const fields = [title, author, date, venue, bestRank, jcr, cas, ccf, details];
  block.querySelectorAll = () => fields;
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    publications: [{
      title: "Ranked paper", author_order_zh: "第一作者", author_order_en: "First Author", year: "2026", venue: "Example Journal",
      best_verified_rank: "JCR Q1", jcr_quartile: "JCR Q1", cas_quartile: "中科院 2 区", ccf_category: "CCF B",
      description_zh: "中文论文说明。", description_en: "English paper description.", status: "Published",
    }],
  };

  const result = await runFill(fields, null, generalProfile, [], "zh");

  assert.equal(result.ok, true);
  assert.equal(author.value, "第一作者");
  assert.equal(bestRank.value, "JCR Q1");
  assert.equal(jcr.value, "JCR Q1");
  assert.equal(cas.value, "中科院 2 区");
  assert.equal(ccf.value, "CCF B");
  assert.equal(details.value.includes("中文论文说明。"), true);
  assert.equal(details.value.includes("English paper description."), false);
});

test("clicks Add inside a project section until every APP-selected project has a row", async () => {
  const body = { tagName: "BODY", textContent: "项目经历", parentElement: null };
  const section = { tagName: "DIV", textContent: "项目经历 项目名称 项目角色 项目描述 + 添加", parentElement: body };
  const rows = [0, 1].map((index) => {
    const row = { tagName: "DIV", textContent: "项目名称 项目角色 项目描述", parentElement: section };
    const name = new FakeInput({ id: `auto-project-name-${index}`, label: "项目名称", parentElement: row });
    const role = new FakeInput({ id: `auto-project-role-${index}`, label: "项目角色", parentElement: row });
    const description = new FakeTextarea({ id: `auto-project-description-${index}`, label: "项目描述", parentElement: row });
    row.querySelectorAll = () => [name, role, description];
    return { row, name, role, description };
  });
  const secondControls = [rows[1].name, rows[1].role, rows[1].description];
  for (const field of secondControls) {
    field.offsetParent = null;
    field.getClientRects = () => [];
  }
  const allFields = rows.flatMap((row) => [row.name, row.role, row.description]);
  section.querySelectorAll = () => allFields;
  const addButton = {
    textContent: "+ 添加", value: "", parentElement: section, offsetParent: {},
    getClientRects: () => [1],
    click() {
      for (const field of secondControls) {
        field.offsetParent = {};
        field.getClientRects = () => [1];
      }
    },
  };
  const packet = {
    authority: "final_customized_cv_only", provenance: "frozen_submitted_template", application_id: "APP-2026-ABC-201",
    projects: [
      { name: "岗位相关研究项目", role: "第一作者", bullets: ["研究描述。"] },
      { name: "岗位相关应用项目", role: "独立开发者", bullets: ["应用描述。"] },
    ],
  };

  const result = await runFill(allFields, packet, null, [addButton]);

  assert.equal(result.ok, true);
  assert.equal(rows[0].name.value, "岗位相关研究项目");
  assert.equal(rows[1].name.value, "岗位相关应用项目");
  assert.equal(result.fields.includes("project.rowsAdded"), true);
});

test("fills a flat project form whose visible labels are not bound to the inputs", async () => {
  const body = { tagName: "BODY", textContent: "Application", parentElement: null };
  const form = { tagName: "DIV", textContent: "Application form", parentElement: body };
  const field = (FieldType, id, label, placeholder = "Please enter") => {
    const wrapper = { tagName: "DIV", textContent: label, parentElement: form, previousElementSibling: null };
    const control = new FieldType({ id, label: "", placeholder, parentElement: wrapper });
    control.previousElementSibling = {
      textContent: label,
      previousElementSibling: null,
      matches: () => false,
      querySelector: () => null,
    };
    wrapper.querySelectorAll = () => [control];
    return control;
  };
  const name = field(FakeInput, "flat-1", "Project name *");
  const role = field(FakeInput, "flat-2", "Title");
  const start = field(FakeInput, "flat-3", "Start & end date *", "YYYY-MM");
  const end = field(FakeInput, "flat-4", "Start & end date *", "YYYY-MM");
  const url = field(FakeInput, "flat-5", "Project URL");
  const description = field(FakeTextarea, "flat-6", "Description *");
  const fillers = Array.from({ length: 30 }, (_, index) => field(FakeInput, `other-${index}`, "Unrelated field"));
  const fields = [name, role, start, end, url, description, ...fillers];
  form.querySelectorAll = () => fields;
  const packet = {
    authority: "final_customized_cv_only",
    provenance: "final_customized_cv",
    application_id: "APP-2026-BYT-0127",
    projects: [{
      name: "Agent reliability research",
      role: "Project lead",
      start_year: "2026",
      start_month: "01",
      end_year: "2026",
      end_month: "08",
      links: [{ url: "https://github.com/example/project" }],
      bullets: ["Designed and validated a reproducible agent workflow."],
    }],
  };

  const result = await runFill(fields, packet);

  assert.equal(result.ok, true);
  assert.equal(name.value, "Agent reliability research");
  assert.equal(role.value, "Project lead");
  assert.equal(start.value, "2026-01");
  assert.equal(end.value, "2026-08");
  assert.equal(url.value, "https://github.com/example/project");
  assert.equal(description.value, "Designed and validated a reproducible agent workflow.");
  assert.equal(fillers.every((item) => item.value === ""), true);
});

test("auto-adds publication rows and binds every field within the same contaminated card", async () => {
  const body = { tagName: "BODY", textContent: "论文/期刊", parentElement: null };
  const section = { tagName: "DIV", textContent: "论文/期刊 论文名称 作者顺序 发表时间 刊物/机构 论文详情 + 添加", parentElement: body };
  const rows = [0, 1].map((index) => {
    const row = { tagName: "DIV", textContent: "论文名称 作者顺序 发表时间 刊物/机构 论文详情", parentElement: section };
    const title = new FakeInput({ id: `real-paper-title-${index}`, label: "论文名称", parentElement: row });
    const author = new FakeSelect({ id: `real-paper-author-${index}`, label: "作者顺序", parentElement: row, options: ["请选择", "第一作者", "第二作者", "共同作者"] });
    const date = new FakeInput({ id: `real-paper-date-${index}`, label: "发表时间", placeholder: "请选择日期", parentElement: row, type: "date", readOnly: true });
    const level = new FakeSelect({ id: `real-paper-level-${index}`, label: "刊物/机构", parentElement: row, options: ["请选择", "Level 1（如：中科院一区、CCF A、SSCI/SCI Q1）", "Level 2", "Level 3"] });
    const details = new FakeTextarea({ id: `real-paper-details-${index}`, label: "论文详情", parentElement: row });
    row.querySelectorAll = () => [title, author, date, level, details];
    for (const field of [title, author, date, level, details]) {
      field.closest = (selector) => selector.includes('[role="group"]') ? row : null;
    }
    return { row, title, author, date, level, details };
  });
  const secondControls = Object.values(rows[1]).filter((value) => value instanceof FakeField);
  for (const field of secondControls) {
    field.offsetParent = null;
    field.getClientRects = () => [];
  }
  const allFields = rows.flatMap((row) => [row.title, row.author, row.date, row.level, row.details]);
  section.querySelectorAll = () => allFields;
  const addButton = {
    textContent: "+ 添加", value: "", parentElement: section, offsetParent: {}, getClientRects: () => [1],
    click() {
      for (const field of secondControls) {
        field.offsetParent = {};
        field.getClientRects = () => [1];
      }
    },
  };
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    publications: [
      {
        title: "Semiparametric confidence sets for cross-sectional and longitudinal neuroimaging",
        author_order: "First Author and Corresponding Author",
        publication_date: "2025-10-31",
        venue: "Imaging Neuroscience",
        level: "Level 2",
        details: "构建适用于横断面与纵向神经影像的半参数效应量置信集。",
      },
      {
        title: "Statistical considerations for evaluating treatment effect under various non-proportional hazard scenarios",
        author_order: "First Author",
        publication_date: "2025-02-11",
        venue: "Statistical Methods in Medical Research",
        level: "Level 1",
        details: "比较非比例风险情景下多种生存分析方法的功效、I 类错误与时间依赖偏差。",
      },
    ],
  };

  const result = await runFill(allFields, null, generalProfile, [addButton]);

  assert.equal(result.ok, true);
  assert.equal(result.fields.includes("publication.rowsAdded"), true);
  assert.equal(rows[0].title.value, generalProfile.publications[0].title);
  assert.equal(rows[0].date.value, "2025-10-31");
  assert.equal(rows[0].details.value, generalProfile.publications[0].details);
  assert.equal(rows[0].details.value.includes("Statistical Methods in Medical Research"), false);
  assert.equal(rows[0].level.value.includes("Level 2"), true);
  assert.equal(rows[1].title.value, generalProfile.publications[1].title);
  assert.equal(rows[1].date.value, "2025-02-11");
  assert.equal(rows[1].level.value.includes("Level 1"), true);
  assert.equal(rows[1].details.value, generalProfile.publications[1].details);
});

test("fills a publication card whose visible labels are not associated with its controls", async () => {
  const body = { tagName: "BODY", textContent: "论文/期刊", innerText: "论文/期刊", parentElement: null };
  const block = {
    tagName: "DIV",
    textContent: "论文名称 作者顺序 发表时间 刊物/机构 论文详情",
    innerText: "论文名称 作者顺序 发表时间 刊物/机构 论文详情",
    parentElement: body,
  };
  const title = new FakeInput({ id: "field-a91", label: "", placeholder: "请输入", parentElement: block });
  const author = new FakeSelect({ id: "field-b82", label: "", parentElement: block, options: ["请选择", "第一作者", "第二作者", "共同作者"] });
  const date = new FakeInput({ id: "field-c73", label: "", placeholder: "请选择日期", parentElement: block, type: "date", readOnly: true });
  const venue = new FakeSelect({ id: "field-d64", label: "", parentElement: block, options: ["请选择", "期刊", "会议", "其他"] });
  const details = new FakeTextarea({ id: "field-e55", label: "", placeholder: "请填写论文详情，也可填写论文链接", parentElement: block });
  const fields = [title, author, date, venue, details];
  block.querySelectorAll = () => fields;
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    publications: [{
      title: "Semiparametric confidence sets for cross-sectional and longitudinal neuroimaging",
      author_order: "First Author and Corresponding Author",
      publication_date: "2025-10-31",
      venue: "Imaging Neuroscience",
      details: "提出适用于横断面与纵向神经影像的半参数效应量置信集方法。",
    }],
  };

  const result = await runFill(fields, null, generalProfile);

  assert.equal(result.ok, true);
  assert.equal(title.value, generalProfile.publications[0].title, JSON.stringify(result));
  assert.equal(author.value, "第一作者");
  assert.equal(date.value, "2025-10-31");
  assert.equal(venue.value, "期刊");
  assert.equal(details.value, generalProfile.publications[0].details);
});

test("auto-adds education rows before binding doctorate, masters, and bachelors records", async () => {
  const body = { tagName: "BODY", textContent: "教育经历", parentElement: null };
  const section = { tagName: "DIV", textContent: "教育经历 学校名称 学历层次 起止时间 + 添加", parentElement: body };
  const rows = [0, 1, 2].map((index) => {
    const row = { tagName: "DIV", textContent: "学校名称 学历层次 起止时间", parentElement: section };
    const start = new FakeInput({ id: `education-start-${index}`, label: "起止时间", placeholder: "YYYY-MM", parentElement: row });
    const end = new FakeInput({ id: `education-end-${index}`, label: "起止时间", placeholder: "YYYY-MM", parentElement: row });
    const school = new FakeInput({ id: `education-school-${index}`, label: "学校名称", parentElement: row });
    const degree = new FakeInput({ id: `education-degree-${index}`, label: "学历层次", parentElement: row });
    row.querySelectorAll = () => [start, end, school, degree];
    return { start, end, school, degree };
  });
  for (const row of rows.slice(1)) {
    for (const field of Object.values(row)) {
      field.offsetParent = null;
      field.getClientRects = () => [];
    }
  }
  const fields = rows.flatMap((row) => Object.values(row));
  section.querySelectorAll = () => fields;
  let visibleRows = 1;
  const addButton = {
    textContent: "+ 添加", value: "", parentElement: section, offsetParent: {}, getClientRects: () => [1],
    click() {
      if (visibleRows >= rows.length) return;
      for (const field of Object.values(rows[visibleRows])) {
        field.offsetParent = {};
        field.getClientRects = () => [1];
      }
      visibleRows += 1;
    },
  };
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [
      { school: "Vanderbilt University", school_zh: "范德堡大学", degree: "博士研究生", start_year: "2023", start_month: "08", end_year: "2027", end_month: "05" },
      { school: "Yale University", school_zh: "耶鲁大学", degree: "硕士研究生", start_year: "2021", start_month: "08", end_year: "2023", end_month: "05" },
      { school: "Southwestern University of Finance and Economics", school_zh: "西南财经大学", degree: "本科", start_year: "2017", start_month: "09", end_year: "2021", end_month: "06" },
    ],
  };

  const result = await runFill(fields, null, generalProfile, [addButton]);

  assert.equal(result.ok, true);
  assert.equal(result.fields.includes("education.rowsAdded"), true);
  assert.deepEqual(rows.map((row) => row.school.value), ["Vanderbilt University", "Yale University", "Southwestern University of Finance and Economics"]);
  assert.deepEqual(rows.map((row) => row.start.value), ["2023-08", "2021-08", "2017-09"]);
  assert.deepEqual(rows.map((row) => row.end.value), ["2027-05", "2023-05", "2021-06"]);
});

test("auto-adds award rows and preserves a manually entered award field", async () => {
  const body = { tagName: "BODY", textContent: "荣誉奖励", parentElement: null };
  const section = { tagName: "DIV", textContent: "荣誉奖励 获奖时间 获奖名称 获奖情况 + 添加", parentElement: body };
  const rows = [0, 1].map((index) => {
    const row = { tagName: "DIV", textContent: "获奖时间 获奖名称 获奖情况", parentElement: section };
    const year = new FakeInput({ id: `award-auto-year-${index}`, label: "获奖时间", placeholder: "YYYY", parentElement: row });
    const name = new FakeInput({ id: `award-auto-name-${index}`, label: "获奖名称", parentElement: row });
    const summary = new FakeTextarea({ id: `award-auto-summary-${index}`, label: "获奖情况", parentElement: row });
    row.querySelectorAll = () => [year, name, summary];
    return { year, name, summary };
  });
  for (const field of Object.values(rows[1])) {
    field.offsetParent = null;
    field.getClientRects = () => [];
  }
  rows[0].name.value = "我已手动填写的奖项名称";
  const fields = rows.flatMap((row) => Object.values(row));
  section.querySelectorAll = () => fields;
  const addButton = {
    textContent: "+ 添加", value: "", parentElement: section, offsetParent: {}, getClientRects: () => [1],
    click() {
      for (const field of Object.values(rows[1])) {
        field.offsetParent = {};
        field.getClientRects = () => [1];
      }
    },
  };
  const generalProfile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [],
    awards: [
      { year: "2026", name: "Pathbreaking Discovery Award", description: "个人奖。" },
      { year: "2026", name: "NIH Replication Prize", description: "团队奖。" },
    ],
  };

  const result = await runFill(fields, null, generalProfile, [addButton]);

  assert.equal(result.ok, true);
  assert.equal(result.fields.includes("award.rowsAdded"), true);
  assert.equal(rows[0].name.value, "我已手动填写的奖项名称");
  assert.equal(rows[1].name.value, "NIH Replication Prize");
  assert.deepEqual(rows.map((row) => row.year.value), ["2026", "2026"]);
});

test("auto-adds structured campus experience rows only when authoritative records exist", async () => {
  const body = { tagName: "BODY", textContent: "校园经历", parentElement: null };
  const section = { tagName: "DIV", textContent: "校园经历 组织名称 担任职务 起止时间 经历描述 + 添加", parentElement: body };
  const rows = [0, 1].map((index) => {
    const row = { tagName: "DIV", textContent: "组织名称 担任职务 起止时间 经历描述", parentElement: section };
    const organization = new FakeInput({ id: `campus-org-${index}`, label: "组织名称", parentElement: row });
    const role = new FakeInput({ id: `campus-role-${index}`, label: "担任职务", parentElement: row });
    const start = new FakeInput({ id: `campus-start-${index}`, label: "起止时间", placeholder: "YYYY-MM", parentElement: row });
    const end = new FakeInput({ id: `campus-end-${index}`, label: "起止时间", placeholder: "YYYY-MM", parentElement: row });
    const description = new FakeTextarea({ id: `campus-description-${index}`, label: "经历描述", parentElement: row });
    row.querySelectorAll = () => [organization, role, start, end, description];
    return { organization, role, start, end, description };
  });
  for (const field of Object.values(rows[1])) {
    field.offsetParent = null;
    field.getClientRects = () => [];
  }
  const fields = rows.flatMap((row) => Object.values(row));
  section.querySelectorAll = () => fields;
  const addButton = {
    textContent: "+ 添加", value: "", parentElement: section, offsetParent: {}, getClientRects: () => [1],
    click() {
      for (const field of Object.values(rows[1])) {
        field.offsetParent = {};
        field.getClientRects = () => [1];
      }
    },
  };
  const packet = {
    authority: "final_customized_cv_only",
    application_id: "APP-2026-ABC-202",
    campus_experiences: [
      { organization: "Student Organization A", role: "Chair", start_year: "2025", start_month: "01", end_year: "2025", end_month: "12", bullets: ["组织活动。"] },
      { organization: "Student Organization B", role: "Member", start_year: "2024", start_month: "01", end_year: "2024", end_month: "12", bullets: ["参与活动。"] },
    ],
  };

  const result = await runFill(fields, packet, null, [addButton]);

  assert.equal(result.ok, true);
  assert.equal(result.fields.includes("campus.rowsAdded"), true);
  assert.deepEqual(rows.map((row) => row.organization.value), ["Student Organization A", "Student Organization B"]);
  assert.deepEqual(rows.map((row) => row.start.value), ["2025-01", "2024-01"], JSON.stringify(result));
  assert.deepEqual(rows.map((row) => row.end.value), ["2025-12", "2024-12"]);
});
