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

class FakeInput extends FakeField {}
class FakeTextarea extends FakeField {}
class FakeSelect extends FakeField {
  constructor({ options = [], ...rest }) {
    super(rest);
    this.options = options.map((text) => ({ value: text, textContent: text }));
  }
}

async function runFill(fields, packet, generalProfile = null) {
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
      return selector.includes("input:not") ? fields : [];
    },
  };
  const window = {};
  const context = vm.createContext({
    window,
    document,
    location: { hostname: "example.cn" },
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
    listener({ type: "IVY_FILL_PAGE", applicationPacket: packet, generalProfile }, {}, resolve);
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
  assert.deepEqual(new Set(result.fields), new Set(["project.startDate", "project.endDate", "project.name", "project.role", "project.description", "project.periodByName"]));
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
  assert.equal(start.value, "2026-05-01");
  assert.equal(end.value, "2026-08-31");
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
  assert.equal(result.fields.includes("project.periodByName"), true);
});

test("corrects swapped education dates by school in the primary fill flow", async () => {
  const page = { tagName: "DIV", textContent: "教育背景", parentElement: null };
  const vanderbiltBlock = { tagName: "DIV", textContent: "起止时间 学校名称 学历 专业", parentElement: page };
  const swufeBlock = { tagName: "DIV", textContent: "起止时间 学校名称 学历 专业", parentElement: page };
  const vStart = new FakeInput({ id: "v-start", label: "起止时间", placeholder: "YYYY-MM", parentElement: vanderbiltBlock, readOnly: true });
  const vEnd = new FakeInput({ id: "v-end", label: "起止时间", placeholder: "YYYY-MM", parentElement: vanderbiltBlock, readOnly: true });
  const vSchool = new FakeInput({ id: "v-school", label: "学校名称", parentElement: vanderbiltBlock });
  const sStart = new FakeInput({ id: "s-start", label: "起止时间", placeholder: "YYYY-MM", parentElement: swufeBlock, readOnly: true });
  const sEnd = new FakeInput({ id: "s-end", label: "起止时间", placeholder: "YYYY-MM", parentElement: swufeBlock, readOnly: true });
  const sSchool = new FakeInput({ id: "s-school", label: "学校名称", parentElement: swufeBlock });
  vStart.value = "2017-09";
  vEnd.value = "2021-06";
  vSchool.value = "范德堡大学";
  sStart.value = "2023-08";
  sEnd.value = "2027-05";
  sSchool.value = "西南财经大学";
  vanderbiltBlock.querySelectorAll = () => [vStart, vEnd, vSchool];
  swufeBlock.querySelectorAll = () => [sStart, sEnd, sSchool];
  const profile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [
      { school: "Vanderbilt University", school_zh: "范德堡大学", start_year: "2023", start_month: "08", end_year: "2027", end_month: "05" },
      { school: "Southwestern University of Finance and Economics", school_zh: "西南财经大学", start_year: "2017", start_month: "09", end_year: "2021", end_month: "06" },
    ],
  };

  const result = await runFill([vStart, vEnd, vSchool, sStart, sEnd, sSchool], null, profile);

  assert.equal(result.ok, true);
  assert.equal(vStart.value, "2023-08");
  assert.equal(vEnd.value, "2027-05");
  assert.equal(sStart.value, "2017-09");
  assert.equal(sEnd.value, "2021-06");
  assert.equal(result.fields.includes("education.periodBySchool"), true);
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
