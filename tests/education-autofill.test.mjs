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
  constructor({ id, label, value, parentElement, placeholder = "", readOnly = false }) {
    super("", parentElement);
    this.id = id;
    this.label = label;
    this.name = "";
    this.type = "text";
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
  getClientRects() { return [1]; }
  closest() { return null; }
  dispatchEvent() {}
  matches() { return true; }
  contains(node) { return node === this; }
  querySelectorAll() { return []; }
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
  block.controls = [startField, endField, schoolField];
  return { startField, endField, schoolField };
}

test("corrects prefilled education dates by the school in each block", async () => {
  const body = new FakeNode("教育背景", null);
  body.tagName = "BODY";
  const vanderbilt = educationBlock(body, "v", "范德堡大学", "2017-09", "2021-06");
  const swufe = educationBlock(body, "s", "西南财经大学", "2023-08", "2027-05");
  const fields = [vanderbilt.startField, vanderbilt.endField, vanderbilt.schoolField, swufe.startField, swufe.endField, swufe.schoolField];
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
