"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = {
  captureKey: string;
};

function buildBookmarklet(capturePageUrl: string, key: string) {
  const code = `(()=>{try{
const clean=(value,max=50000)=>String(value||"").replace(/\\u0000/g,"").replace(/\\s+/g," ").trim().slice(0,max);
const text=(node)=>clean(node&&(node.innerText||node.textContent));
const findPosting=(value)=>{if(!value)return null;if(Array.isArray(value)){for(const item of value){const found=findPosting(item);if(found)return found;}return null;}if(typeof value!=="object")return null;const type=value["@type"];if(type==="JobPosting"||(Array.isArray(type)&&type.includes("JobPosting")))return value;for(const item of Object.values(value)){const found=findPosting(item);if(found)return found;}return null;};
let posting=null;
for(const script of document.querySelectorAll('script[type="application/ld+json"]')){try{posting=findPosting(JSON.parse(script.textContent||""));if(posting)break;}catch{}}
const queryText=(selectors)=>{for(const selector of selectors){const value=text(document.querySelector(selector));if(value)return value;}return "";};
const stripHtml=(value)=>{const box=document.createElement("div");box.innerHTML=String(value||"");return text(box);};
const address=(()=>{const raw=Array.isArray(posting&&posting.jobLocation)?posting.jobLocation[0]:posting&&posting.jobLocation;return raw&&raw.address||{};})();
const organization=posting&&posting.hiringOrganization;
const selected=clean(window.getSelection&&window.getSelection().toString(),40000);
const description=stripHtml(posting&&posting.description)||selected||queryText(['[data-testid*="job-description"]','.job-description','.job-sec-text','[class*="job-description"]','[class*="jobDescription"]','main','article'])||clean(document.body&&document.body.innerText,40000);
const title=clean(posting&&posting.title,500)||queryText(['h1','[data-testid*="job-title"]','.job-name','[class*="job-title"]','[class*="jobTitle"]'])||clean(document.title,500);
const company=clean(organization&&(organization.name||organization.legalName),300)||queryText(['[data-testid*="company-name"]','.company-name','[class*="company-name"]','[class*="companyName"]','a[href*="company"] h2','a[href*="company"] h3'])||clean((document.querySelector('meta[property="og:site_name"]')||{}).content,300);
const jobLocation=clean([address.addressLocality,address.addressRegion,address.addressCountry].filter(Boolean).join(" · "),500)||queryText(['[data-testid*="location"]','.job-location','.job-area','[class*="job-location"]','[class*="jobLocation"]']);
const country=clean(address.addressCountry,200);
const identifier=posting&&posting.identifier;
const params=new URL(window.location.href).searchParams;
const applicationId=clean(typeof identifier==="string"?identifier:identifier&&(identifier.value||identifier.name),500)||clean(params.get("gh_jid")||params.get("jobId")||params.get("job_id")||params.get("reqId")||params.get("requisitionId"),500);
const payload={key:${JSON.stringify(key)},jobUrl:window.location.href,title,company,location:jobLocation,description,applicationId,addressCountry:country,sourcePageTitle:document.title};
const captureUrl=new URL(${JSON.stringify(capturePageUrl)});
let popup=null;
let sent=false;
const listener=(event)=>{if(sent||event.source!==popup||event.origin!==captureUrl.origin||event.data!=="ivy-job-radar-ready")return;sent=true;window.removeEventListener("message",listener);popup.postMessage({type:"ivy-job-radar-capture",payload},captureUrl.origin);};
window.addEventListener("message",listener);
popup=window.open(captureUrl.href,"ivy_job_radar_capture","popup,width=600,height=760");
if(!popup){window.removeEventListener("message",listener);alert("Chrome 阻止了保存窗口，请允许此网站打开弹窗后重试。");return;}
setTimeout(()=>{if(!sent){window.removeEventListener("message",listener);try{popup.postMessage({type:"ivy-job-radar-capture",payload},captureUrl.origin);}catch{}}},2500);
}catch(error){alert("无法保存当前岗位："+(error&&error.message?error.message:error));}})()`;
  return `javascript:${code}`;
}

export default function BookmarkletInstaller({ captureKey }: Props) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const bookmarkletRef = useRef("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!captureKey || !linkRef.current) return;
    const bookmarklet = buildBookmarklet(`${window.location.origin}/bookmarklet/capture`, captureKey);
    bookmarkletRef.current = bookmarklet;
    linkRef.current.setAttribute("href", bookmarklet);
  }, [captureKey]);

  const copyCode = async () => {
    const bookmarklet = bookmarkletRef.current
      || buildBookmarklet(`${window.location.origin}/bookmarklet/capture`, captureKey);
    if (!bookmarklet) return;
    await navigator.clipboard.writeText(bookmarklet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f3f0e8", color: "#18221d", padding: "48px 20px" }}>
      <section style={{ maxWidth: 820, margin: "0 auto" }}>
        <Link href="/" style={{ color: "#536159", textDecoration: "none", fontWeight: 700 }}>← 返回 Ivy Job Radar</Link>
        <p style={{ marginTop: 48, letterSpacing: ".16em", fontSize: 12, fontWeight: 800, color: "#718078" }}>CHROME BOOKMARK CAPTURE</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(38px, 7vw, 70px)", lineHeight: 1.02, margin: "12px 0 20px" }}>浏览岗位时，一键加入岗位池</h1>
        <p style={{ maxWidth: 680, fontSize: 18, lineHeight: 1.75, color: "#536159" }}>
          把下面的按钮拖到 Chrome 书签栏。以后在 LinkedIn、BOSS、猎聘、公司官网或其他招聘页面看到合适岗位，点击书签即可直接去重加入 Ivy Job Radar，不进入核验队列。
        </p>

        <article style={{ marginTop: 34, background: "#fff", border: "1px solid #d8d4c9", borderRadius: 24, padding: "30px", boxShadow: "0 22px 60px rgba(32,40,35,.10)" }}>
          {!captureKey ? (
            <p style={{ color: "#a1372d", fontWeight: 700 }}>服务器尚未配置同步密钥，暂时无法生成安全书签。</p>
          ) : (
            <>
              <p style={{ marginTop: 0, fontWeight: 800 }}>1. 显示 Chrome 书签栏：⌘ + Shift + B</p>
              <p style={{ color: "#66736c" }}>2. 用鼠标把绿色按钮直接拖到书签栏，不是普通点击。</p>
              <a
                ref={linkRef}
                href="#"
                draggable
                onClick={(event) => {
                  event.preventDefault();
                  window.alert("请把这个按钮拖到 Chrome 书签栏。安装后，在招聘页面点击书签即可保存。");
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 14,
                  borderRadius: 999,
                  padding: "15px 22px",
                  background: "#16794b",
                  color: "white",
                  textDecoration: "none",
                  fontWeight: 850,
                  boxShadow: "0 10px 28px rgba(22,121,75,.25)",
                  cursor: "grab",
                }}
              >
                ＋ 保存到 Ivy Job Radar
              </a>
              <button
                type="button"
                onClick={() => void copyCode()}
                style={{ marginLeft: 10, border: "1px solid #cfcabe", borderRadius: 999, padding: "14px 18px", background: "#f7f5ef", fontWeight: 750, cursor: "pointer" }}
              >
                {copied ? "已复制" : "无法拖动时复制代码"}
              </button>
            </>
          )}
        </article>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginTop: 20 }}>
          {[
            ["直接加入", "手动点击代表你已经确认岗位合适，因此状态直接设为“开放”。"],
            ["自动去重", "优先按规范化链接和 Requisition ID 去重；重复岗位只更新页面信息。"],
            ["自动提取", "优先读取 JobPosting JSON-LD，并回退到标题、公司、地点和可见 JD 文本。"],
          ].map(([title, body]) => (
            <article key={title} style={{ background: "rgba(255,255,255,.68)", border: "1px solid #ded9ce", borderRadius: 18, padding: 20 }}>
              <strong>{title}</strong><p style={{ marginBottom: 0, lineHeight: 1.6, color: "#647169" }}>{body}</p>
            </article>
          ))}
        </div>
        <p style={{ marginTop: 24, color: "#758078", fontSize: 13 }}>
          书签中只包含一个专用于“加入岗位”的派生密钥，不包含 Job Radar 的原始同步密钥。岗位内容通过浏览器消息传给 Job Radar，不写入地址栏或访问日志。
        </p>
      </section>
    </main>
  );
}
