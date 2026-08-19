const SPEC = [
  ["section","身份信息"],
  ["identity.firstName","First name"],["identity.middleName","Middle name"],["identity.lastName","Last name"],["identity.preferredName","Preferred name"],["identity.email","Email","email"],["identity.phone","Phone","tel"],
  ["section","地址与链接"],
  ["location.address1","Address line 1"],["location.address2","Address line 2"],["location.city","City"],["location.state","State / Province"],["location.postalCode","ZIP / Postal code"],["location.country","Country"],["links.linkedin","LinkedIn","url"],["links.github","GitHub","url"],["links.website","Personal website","url"],
  ["section","最高/当前教育"],
  ["education.school","School / University"],["education.degree","Degree"],["education.major","Major / Field of study"],["education.graduationMonth","Graduation month"],["education.graduationYear","Graduation year"],
  ["section","最近一段经历（可选）"],
  ["employment.employer","Employer"],["employment.title","Job title"],["employment.location","Employment location"],["employment.startMonth","Start month"],["employment.startYear","Start year"],["employment.endMonth","End month"],["employment.endYear","End year"],
  ["section","常见资格问题"],
  ["eligibility.age18","At least 18 years old?","yesno"],["eligibility.workAuthorizationUS","Authorized to work in the U.S.?","yesno"],["eligibility.sponsorshipUS","Need U.S. visa sponsorship now or in the future?","yesno"],["eligibility.relocation","Willing to relocate?","yesno"],["eligibility.remoteWork","Willing / able to work remotely?","yesno"],
  ["section","常见申请信息（可选）"],
  ["application.availableStartDate","Available start date"],["application.salaryExpectation","Salary expectation"],["application.hearAboutUs","How did you hear about us?"]
];

const fields = document.getElementById("fields");
const form = document.getElementById("profileForm");
const status = document.getElementById("status");

function fieldId(path) { return `f-${path.replace(/\./g,"-")}`; }
function getPath(obj, path) { return path.split(".").reduce((v, key) => v && v[key], obj) ?? ""; }
function setPath(obj, path, value) {
  const parts = path.split(".");
  let target = obj;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) target[part] = value;
    else target = target[part] ||= {};
  });
}

for (const [path, label, type = "text"] of SPEC) {
  if (path === "section") {
    const heading = document.createElement("div");
    heading.className = "section";
    heading.textContent = label;
    fields.appendChild(heading);
    continue;
  }
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const labelEl = document.createElement("label");
  labelEl.htmlFor = fieldId(path);
  labelEl.textContent = label;
  let input;
  if (type === "yesno") {
    input = document.createElement("select");
    for (const [value, text] of [["","未设置"],["yes","Yes"],["no","No"]]) {
      const option = document.createElement("option"); option.value = value; option.textContent = text; input.appendChild(option);
    }
  } else {
    input = document.createElement("input");
    input.type = type;
  }
  input.id = fieldId(path);
  input.dataset.path = path;
  wrapper.append(labelEl, input);
  fields.appendChild(wrapper);
}

async function load() {
  const { ivyProfile = {} } = await chrome.storage.local.get(["ivyProfile"]);
  document.querySelectorAll("[data-path]").forEach((el) => { el.value = getPath(ivyProfile, el.dataset.path); });
}

function collect() {
  const profile = { version: 2 };
  document.querySelectorAll("[data-path]").forEach((el) => setPath(profile, el.dataset.path, el.value.trim()));
  return profile;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.local.set({ ivyProfile: collect() });
  status.textContent = "已保存到本机 Chrome 扩展。";
});

document.getElementById("export").addEventListener("click", async () => {
  await navigator.clipboard.writeText(JSON.stringify(collect(), null, 2));
  status.textContent = "申请资料 JSON 已复制。";
});

document.getElementById("import").addEventListener("click", async () => {
  const raw = prompt("粘贴 Ivy Job Radar 申请资料 JSON：");
  if (!raw) return;
  try {
    const profile = JSON.parse(raw);
    await chrome.storage.local.set({ ivyProfile: profile });
    await load();
    status.textContent = "已导入并保存。";
  } catch {
    status.textContent = "JSON 格式不正确。";
  }
});

load();
