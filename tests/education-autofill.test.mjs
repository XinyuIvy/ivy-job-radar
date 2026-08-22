import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

class FakeNode {
  constructor(textContent = "", parentElement = null) {
    this.textContent = textContent;
    this.innerText = textContent;
    this.parentElement = parentElement;
    this.children = [];
    this.controls = [];
    this.tagName = "DIV";
    if (parentElement) parentElement.children.push(this);
  }

  querySelectorAll() {
    return this.controls.length ? this.controls : this.children.flatMap((child) => child.querySelectorAll());
  }
}

class FakeField extends FakeNode {
  constructor({ id, label, value = "", parentElement, placeholder = "", readOnly = false, type = "text" }) {
    super("", parentElement);
    this.id = id;
    this.label = label;
    this.name = "";
    this.type = type;
    this.disabled = false;
    this.readOnly = readOnly;
    this.offsetParent = {};
    this.attributes = new Map([["placeholder", placeholder]]);
    this._value = value;
    parentElement.controls.push(this);
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
  matches() { return true; }
  contains(node) { return node === this; }
  querySelectorAll() { return []; }
  focus() {}
  blur() {}
  click() {}
}

class FakeInput extends FakeField {}
class FakeTextarea extends FakeField {}
class FakeSelect extends FakeField {}

function educationBlock(body, prefix, school, start, end) {
  const block = new FakeNode("起止时间 学校名称 学历 专业", body);
  const period = new FakeNode("起止时间", block);
  const startField = new FakeInput({ id: `${prefix}-start`, label: "起止时间", value: start, placeholder: "YYYY-MM", parentElement: period, readOnly: true });
  const endField = new FakeInput({ id: `${prefix}-end`, label: "起止时间", value: end, placeholder: "YYYY-MM", parentElement: period, readOnly: true });
  const schoolField = new FakeInput({ id: `${prefix}-school`, label: "学校名称", value: school, parentElement: block });
  const degreeField = new FakeInput({ id: `${prefix}-degree`, label: "学历", parentElement: block });
  const majorField = new FakeInput({ id: `${prefix}-major`, label: "专业", parentElement: block });
  block.controls = [startField, endField, schoolField, degreeField, majorField];
  return { startField, endField, schoolField, degreeField, majorField, block };
}

function blankEducationBlock(body, prefix) {
  const block = new FakeNode("教育经历 起止时间 学校名称 学历 专业", body);
  const startField = new FakeInput({ id: `${prefix}-start`, label: "起止时间", placeholder: "开始日期", parentElement: block, type: "date", readOnly: true });
  const endField = new FakeInput({ id: `${prefix}-end`, label: "起止时间", placeholder: "结束日期", parentElement: block, type: "date", readOnly: true });
  const schoolField = new FakeInput({ id: `${prefix}-school`, label: "学校名称", parentElement: block });
  const degreeField = new FakeInput({ id: `${prefix}-degree`, label: "学历", parentElement: block });
  const majorField = new FakeInput({ id: `${prefix}-major`, label: "专业", parentElement: block });
  block.controls = [startField, endField, schoolField, degreeField, majorField];
  return { block, startField, endField, schoolField, degreeField, majorField };
}

async function runEducationFill(body, fields, profile) {
  body.controls = fields;
  const labels = new Map(fields.map((field) => [field.id, { textContent: field.label }]));
  let listener;
  const document = {
    body,
    querySelector(selector) {
      const match = selector.match(/^label\[for="(.+)"\]$/);
      return match ? labels.get(match[1]) || null : null;
    },
    querySelectorAll() { return fields; },
  };
  const context = vm.createContext({
    window: {}, document,
    CSS: { escape: (value) => value },
    Event: class {}, KeyboardEvent: class {}, setTimeout,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextarea,
    HTMLSelectElement: FakeSelect,
    chrome: { runtime: { onMessage: { addListener: (callback) => { listener = callback; } } } },
  });
  const source = await readFile(new URL("../browser-extension/education-autofill.js", import.meta.url), "utf8");
  vm.runInContext(source, context);
  return new Promise((resolve) => listener({ type: "IVY_FILL_GENERAL_EDUCATION", generalProfile: profile }, {}, resolve));
}

test("corrects prefilled education dates by the school in each block", async () => {
  const body = new FakeNode("教育背景", null);
  body.tagName = "BODY";
  const vanderbilt = educationBlock(body, "v", "范德堡大学", "2017-09", "2021-06");
  const swufe = educationBlock(body, "s", "西南财经大学", "2023-08", "2027-05");
  const fields = [vanderbilt, swufe].flatMap((item) => item.block.controls);
  body.controls = fields;
  const labels = new Map(fields.map((field) => [field.id, { textContent: field.label }]));
  let listener;
  const document = {
    body,
    querySelector(selector) {
      const match = selector.match(/^label\[for="(.+)"\]$/);
      return match ? labels.get(match[1]) || null : null;
    },
    querySelectorAll() { return fields; },
  };
  const context = vm.createContext({
    window: {}, document,
    CSS: { escape: (value) => value },
    Event: class {}, setTimeout,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextarea,
    HTMLSelectElement: FakeSelect,
    chrome: { runtime: { onMessage: { addListener: (callback) => { listener = callback; } } } },
  });
  const source = await readFile(new URL("../browser-extension/education-autofill.js", import.meta.url), "utf8");
  vm.runInContext(source, context);
  const profile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [
      { school: "Vanderbilt University", school_zh: "范德堡大学", start_year: "2023", start_month: "08", end_year: "2027", end_month: "05" },
      { school: "Southwestern University of Finance and Economics", school_zh: "西南财经大学", start_year: "2017", start_month: "09", end_year: "2021", end_month: "06" },
    ],
  };
  const result = await new Promise((resolve) => listener({ type: "IVY_FILL_GENERAL_EDUCATION", generalProfile: profile }, {}, resolve));

  assert.equal(result.ok, true);
  assert.equal(vanderbilt.startField.value, "2023-08");
  assert.equal(vanderbilt.endField.value, "2027-05");
  assert.equal(swufe.startField.value, "2017-09");
  assert.equal(swufe.endField.value, "2021-06");
});

test("binds three education blocks as doctorate, masters, and bachelors", async () => {
  const body = new FakeNode("教育背景", null);
  body.tagName = "BODY";
  const first = blankEducationBlock(body, "first");
  const second = blankEducationBlock(body, "second");
  const third = blankEducationBlock(body, "third");
  const fields = [first, second, third].flatMap((item) => item.block.controls);
  const profile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [
      { school_zh: "西南财经大学", degree: "统计学学士", degree_type: "本科", major: "统计学", start_year: "2017", start_month: "09", end_year: "2021", end_month: "06" },
      { school_zh: "耶鲁大学", degree: "生物统计学硕士", degree_type: "硕士", major: "生物统计学", start_year: "2021", start_month: "08", end_year: "2023", end_month: "05" },
      { school_zh: "范德堡大学", degree: "生物统计学博士", degree_type: "博士", major: "生物统计学", start_year: "2023", start_month: "08", end_year: "2027", end_month: "05" },
    ],
  };

  const result = await runEducationFill(body, fields, profile);

  assert.equal(result.ok, true);
  assert.equal(first.schoolField.value, "范德堡大学");
  assert.equal(first.degreeField.value, "生物统计学博士");
  assert.equal(first.startField.value, "2023-08-01");
  assert.equal(first.endField.value, "2027-05-31");
  assert.equal(second.schoolField.value, "耶鲁大学");
  assert.equal(second.degreeField.value, "生物统计学硕士");
  assert.equal(second.startField.value, "2021-08-01");
  assert.equal(second.endField.value, "2023-05-31");
  assert.equal(third.schoolField.value, "西南财经大学");
  assert.equal(third.degreeField.value, "统计学学士");
  assert.equal(third.startField.value, "2017-09-01");
  assert.equal(third.endField.value, "2021-06-30");
  assert.equal(result.fields.includes("education.periodBySlot"), true);
});

test("keeps each education card internally consistent and clears unknown Yale full dates", async () => {
  const body = new FakeNode("教育背景", null);
  body.tagName = "BODY";
  const first = blankEducationBlock(body, "phd");
  const second = blankEducationBlock(body, "masters");
  const third = blankEducationBlock(body, "bachelors");
  second.startField.value = "2022-12-31";
  second.endField.value = "2021-12-30";
  for (const [prefix, card] of [["phd", first], ["masters", second], ["bachelors", third]]) {
    const advisor = new FakeInput({ id: `${prefix}-advisor`, label: "导师", parentElement: card.block });
    const unit = new FakeInput({ id: `${prefix}-unit`, label: "实验室", parentElement: card.block });
    card.block.controls.push(advisor, unit);
    card.advisor = advisor;
    card.unit = unit;
  }
  const fields = [first, second, third].flatMap((item) => item.block.controls);
  const profile = {
    schema_version: "global-application-autofill-profile-v1",
    education: [
      { school_zh: "耶鲁大学", degree: "生物统计学硕士", major: "生物统计学", start_year: "2021", end_year: "2023", advisor: "Wei Wei", research_unit: "YCAS" },
      { school_zh: "西南财经大学", degree: "统计学学士", major: "统计学", start_year: "2017", start_month: "09", end_year: "2021", end_month: "06", advisor: "吕凤毛", research_unit: "统计研究中心" },
      { school_zh: "范德堡大学", degree: "生物统计学博士", major: "生物统计学", start_year: "2023", start_month: "08", end_year: "2027", end_month: "05", advisor: "Simon Vandekar", research_unit: "VUMC" },
    ],
  };

  const result = await runEducationFill(body, fields, profile);

  assert.equal(result.ok, true);
  assert.deepEqual([first.schoolField.value, first.advisor.value, first.unit.value], ["范德堡大学", "Simon Vandekar", "VUMC"]);
  assert.deepEqual([second.schoolField.value, second.advisor.value, second.unit.value], ["耶鲁大学", "Wei Wei", "YCAS"]);
  assert.equal(second.startField.value, "");
  assert.equal(second.endField.value, "");
  assert.deepEqual([third.schoolField.value, third.advisor.value, third.unit.value], ["西南财经大学", "吕凤毛", "统计研究中心"]);
});
