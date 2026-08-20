"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const STORAGE_KEY = "ivy_job_application_profile_v1";
const CONFIG_KEY = "ivy_job_autofill_config_v1";

type Profile = {
  version: 2;
  identity: { firstName: string; middleName: string; lastName: string; preferredName: string; email: string; phone: string };
  location: { address1: string; address2: string; city: string; state: string; postalCode: string; country: string };
  links: { linkedin: string; github: string; website: string };
  education: { school: string; degree: string; major: string; graduationMonth: string; graduationYear: string };
  employment: { employer: string; title: string; location: string; startMonth: string; startYear: string; endMonth: string; endYear: string };
  eligibility: { age18: string; workAuthorizationUS: string; sponsorshipUS: string; relocation: string; remoteWork: string };
  application: { availableStartDate: string; salaryExpectation: string; hearAboutUs: string };
};

const emptyProfile: Profile = {
  version: 2,
  identity: { firstName: "", middleName: "", lastName: "", preferredName: "", email: "", phone: "" },
  location: { address1: "", address2: "", city: "", state: "", postalCode: "", country: "" },
  links: { linkedin: "", github: "", website: "" },
  education: { school: "", degree: "", major: "", graduationMonth: "", graduationYear: "" },
  employment: { employer: "", title: "", location: "", startMonth: "", startYear: "", endMonth: "", endYear: "" },
  eligibility: { age18: "", workAuthorizationUS: "", sponsorshipUS: "", relocation: "", remoteWork: "" },
  application: { availableStartDate: "", salaryExpectation: "", hearAboutUs: "" },
};

const fieldGroups = [
  ["身份信息", [
    ["identity.firstName", "First name"], ["identity.middleName", "Middle name"], ["identity.lastName", "Last name"],
    ["identity.preferredName", "Preferred name"], ["identity.email", "Email"], ["identity.phone", "Phone"],
  ]],
  ["地址与链接", [
    ["location.address1", "Address line 1"], ["location.address2", "Address line 2"],
    ["location.city", "City"], ["location.state", "State / Province"], ["location.postalCode", "ZIP / Postal code"], ["location.country", "Country"],
    ["links.linkedin", "LinkedIn"], ["links.github", "GitHub"], ["links.website", "Personal website"],
  ]],
  ["旧版教育回退值（global profile 不可用时才使用）", [
    ["education.school", "School / University"], ["education.degree", "Degree"], ["education.major", "Major / Field of study"],
    ["education.graduationMonth", "Graduation month"], ["education.graduationYear", "Graduation year"],
  ]],
  ["经历备用值（仅无最终 APP CV 时使用）", [
    ["employment.employer", "Employer"], ["employment.title", "Job title"], ["employment.location", "Employment location"],
    ["employment.startMonth", "Start month"], ["employment.startYear", "Start year"], ["employment.endMonth", "End month"], ["employment.endYear", "End year"],
  ]],
  ["常见申请信息（可选）", [
    ["application.availableStartDate", "Available start date"], ["application.salaryExpectation", "Salary expectation"], ["application.hearAboutUs", "How did you hear about us?"],
  ]],
] as const;

function getPath(profile: Profile, path: string) {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : "", profile) as string;
}

function updatePath(profile: Profile, path: string, value: string) {
  const next = structuredClone(profile) as Profile;
  const parts = path.split(".");
  let target = next as unknown as Record<string, unknown>;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) target[part] = value;
    else target = target[part] as Record<string, unknown>;
  });
  return next;
}

function normalizeProfile(raw: unknown): Profile {
  const source = raw && typeof raw === "object" ? raw as Partial<Profile> : {};
  return {
    version: 2,
    identity: { ...emptyProfile.identity, ...(source.identity ?? {}) },
    location: { ...emptyProfile.location, ...(source.location ?? {}) },
    links: { ...emptyProfile.links, ...(source.links ?? {}) },
    education: { ...emptyProfile.education, ...(source.education ?? {}) },
    employment: { ...emptyProfile.employment, ...(source.employment ?? {}) },
    eligibility: { ...emptyProfile.eligibility, ...(source.eligibility ?? {}) },
    application: { ...emptyProfile.application, ...(source.application ?? {}) },
  };
}

export default function AutofillProfileClient({ accessKey }: { accessKey: string }) {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = normalizeProfile(JSON.parse(raw));
        const timer = window.setTimeout(() => setProfile(parsed), 0);
        return () => window.clearTimeout(timer);
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (!accessKey) return;
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify({
      version: 1,
      siteOrigin: window.location.origin,
      accessKey,
    }));
  }, [accessKey]);

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    if (accessKey) {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify({ version: 1, siteOrigin: window.location.origin, accessKey }));
    }
    setMessage("已保存本地基础资料。教育详细信息会实时读取 CV 仓库里的 global application profile；项目、经历描述、技能、项目链接和 PDF 则按当前 APP-ID 的最终定制 CV 读取。这里的教育/经历字段只保留为回退值。");
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
    setMessage("本地基础申请资料 JSON 已复制。教育详细资料不在这里维护，而在 CV 仓库的 global application profile 中维护。");
  };

  return <main className="profile-page">
    <div className="profile-shell">
      <header>
        <div>
          <p className="eyebrow">APPLICATION AUTOFILL · V3</p>
          <h1>本地基础申请资料</h1>
          <p>这里主要保存姓名、联系方式、地址、链接、工作授权等浏览器本地资料。三段教育的学院、导师、研究单位、GPA、排名和研究领域会实时读取 CV 仓库中的 global application profile；当前岗位的项目、经历描述、技能、项目链接和最终 PDF 则由当前 APP-ID 的最终定制 CV 决定。</p>
        </div>
        <Link href="/">返回 Job Radar</Link>
      </header>

      <section className="privacy-note">
        <strong>仍然不会自动处理：</strong> EEO、种族、性别、残障、退伍军人、宗教、出生日期、SSN 等敏感字段；不会绕过验证码，也不会点击 Submit。开放题会列为“未填问题”供你检查，不会擅自编答案。
      </section>

      <form onSubmit={save}>
        {fieldGroups.map(([title, fields]) => <section className="group" key={title}>
          <h2>{title}</h2>
          <div className="grid">
            {fields.map(([path, label]) => <label key={path}>
              <span>{label}</span>
              <input value={getPath(profile, path)} onChange={(event) => setProfile((current) => updatePath(current, path, event.target.value))} />
            </label>)}
          </div>
        </section>)}

        <section className="group">
          <h2>常见资格问题</h2>
          <div className="grid">
            {([
              ["eligibility.age18", "At least 18 years old?"],
              ["eligibility.workAuthorizationUS", "Authorized to work in the U.S.?"],
              ["eligibility.sponsorshipUS", "Need U.S. visa sponsorship now or in the future?"],
              ["eligibility.relocation", "Willing to relocate?"],
              ["eligibility.remoteWork", "Willing / able to work remotely?"],
            ] as const).map(([path, label]) => <label key={path}>
              <span>{label}</span>
              <select value={getPath(profile, path)} onChange={(event) => setProfile((current) => updatePath(current, path, event.target.value))}>
                <option value="">未设置</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </label>)}
          </div>
        </section>

        <div className="actions"><button type="submit">保存资料</button><button type="button" className="secondary" onClick={() => void copyJson()}>复制 JSON</button></div>
      </form>
      {message && <p className="message" aria-live="polite">{message}</p>}
    </div>
    <style>{`
      .profile-page{min-height:100vh;background:#f5f2e9;color:#1f2c25;padding:28px 18px 90px}.profile-shell{max-width:980px;margin:0 auto}
      header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}header h1{font:700 clamp(36px,6vw,58px)/1.05 Georgia,serif;margin:4px 0 8px}header p{color:#58655e;line-height:1.65;max-width:760px;margin:0}header a{color:#16794b;font-weight:800;white-space:nowrap}.eyebrow{color:#16794b!important;font-size:11px!important;font-weight:850!important;letter-spacing:.13em!important}
      .privacy-note{margin:22px 0;background:#fff6df;border:1px solid #ead9ab;border-radius:13px;padding:13px 15px;line-height:1.55}.group{background:#fffef9;border:1px solid #ddd8ca;border-radius:17px;padding:19px;margin-top:16px}.group h2{font:700 23px Georgia,serif;margin:0 0 14px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.grid label{display:grid;gap:5px}.grid span{font-size:12px;color:#5e6b63;font-weight:800}.grid input,.grid select{box-sizing:border-box;width:100%;border:1px solid #cbc7bb;border-radius:9px;padding:10px 11px;background:white;color:#1f2c25;font:inherit}.actions{display:flex;gap:10px;margin-top:18px}.actions button{border:0;border-radius:10px;padding:11px 16px;font-weight:850;background:#16794b;color:white;cursor:pointer}.actions .secondary{background:#fffef9;color:#1f2c25;border:1px solid #c9c4b7}.message{background:#e7f3eb;color:#195c3e;padding:11px 13px;border-radius:10px;line-height:1.55}@media(max-width:700px){header{display:grid}.grid{grid-template-columns:1fr}}
    `}</style>
  </main>;
}
