"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const STORAGE_KEY = "ivy_job_application_profile_v1";

type Profile = {
  version: 1;
  identity: { firstName: string; middleName: string; lastName: string; preferredName: string; email: string; phone: string };
  location: { city: string; state: string; country: string };
  links: { linkedin: string; github: string; website: string };
  education: { school: string; degree: string; major: string; graduationMonth: string; graduationYear: string };
  eligibility: { workAuthorizationUS: string; sponsorshipUS: string; relocation: string };
};

const emptyProfile: Profile = {
  version: 1,
  identity: { firstName: "", middleName: "", lastName: "", preferredName: "", email: "", phone: "" },
  location: { city: "", state: "", country: "" },
  links: { linkedin: "", github: "", website: "" },
  education: { school: "", degree: "", major: "", graduationMonth: "", graduationYear: "" },
  eligibility: { workAuthorizationUS: "", sponsorshipUS: "", relocation: "" },
};

const fieldGroups = [
  ["身份信息", [
    ["identity.firstName", "First name"], ["identity.middleName", "Middle name"], ["identity.lastName", "Last name"],
    ["identity.preferredName", "Preferred name"], ["identity.email", "Email"], ["identity.phone", "Phone"],
  ]],
  ["地点与链接", [
    ["location.city", "City"], ["location.state", "State / Province"], ["location.country", "Country"],
    ["links.linkedin", "LinkedIn"], ["links.github", "GitHub"], ["links.website", "Personal website"],
  ]],
  ["最高 / 当前教育", [
    ["education.school", "School / University"], ["education.degree", "Degree"], ["education.major", "Major / Field of study"],
    ["education.graduationMonth", "Graduation month"], ["education.graduationYear", "Graduation year"],
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

export default function AutofillProfileClient() {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try { setProfile({ ...emptyProfile, ...JSON.parse(raw) } as Profile); } catch { /* Keep an empty profile if the old value is invalid. */ }
  }, []);

  const save = (event?: FormEvent) => {
    event?.preventDefault();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    setMessage("已保存到这个浏览器的 Job Radar 本地存储。现在可以打开 Chrome 扩展并点“从当前 Job Radar 页面导入资料”。");
  };

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(profile, null, 2));
    setMessage("申请资料 JSON 已复制。也可以在扩展的“编辑资料”页面手动导入。");
  };

  return <main className="profile-page">
    <div className="profile-shell">
      <header>
        <div>
          <p className="eyebrow">APPLICATION AUTOFILL</p>
          <h1>标准申请资料</h1>
          <p>只保存在你当前浏览器的 localStorage，不写入公开 GitHub 仓库。Chrome 扩展只在你主动点击时读取并填写申请表。</p>
        </div>
        <Link href="/">返回 Job Radar</Link>
      </header>

      <section className="privacy-note">
        <strong>默认不自动填写：</strong> EEO、种族、性别、残障、退伍军人、宗教、出生日期等敏感字段；也不会自动点击 Submit。
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
              ["eligibility.workAuthorizationUS", "Authorized to work in the U.S.?"],
              ["eligibility.sponsorshipUS", "Need U.S. visa sponsorship now or in the future?"],
              ["eligibility.relocation", "Willing to relocate?"],
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
      header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}header h1{font:700 clamp(36px,6vw,58px)/1.05 Georgia,serif;margin:4px 0 8px}header p{color:#58655e;line-height:1.65;max-width:720px;margin:0}header a{color:#16794b;font-weight:800;white-space:nowrap}.eyebrow{color:#16794b!important;font-size:11px!important;font-weight:850!important;letter-spacing:.13em!important}
      .privacy-note{margin:22px 0;background:#fff6df;border:1px solid #ead9ab;border-radius:13px;padding:13px 15px;line-height:1.55}.group{background:#fffef9;border:1px solid #ddd8ca;border-radius:17px;padding:19px;margin-top:16px}.group h2{font:700 23px Georgia,serif;margin:0 0 14px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.grid label{display:grid;gap:5px}.grid span{font-size:12px;color:#5e6b63;font-weight:800}.grid input,.grid select{box-sizing:border-box;width:100%;border:1px solid #cbc7bb;border-radius:9px;padding:10px 11px;background:white;color:#1f2c25;font:inherit}.actions{display:flex;gap:10px;margin-top:18px}.actions button{border:0;border-radius:10px;padding:11px 16px;font-weight:850;background:#16794b;color:white;cursor:pointer}.actions .secondary{background:#fffef9;color:#1f2c25;border:1px solid #c9c4b7}.message{background:#e7f3eb;color:#195c3e;padding:11px 13px;border-radius:10px;line-height:1.55}@media(max-width:700px){header{display:grid}.grid{grid-template-columns:1fr}}
    `}</style>
  </main>;
}
