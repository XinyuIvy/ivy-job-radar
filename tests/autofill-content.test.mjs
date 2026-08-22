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
  getClientRects() { return [1]; }
  closest() { return null; }
  dispatchEvent() {}
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
