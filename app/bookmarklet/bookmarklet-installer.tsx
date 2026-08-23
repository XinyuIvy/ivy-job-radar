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
const cleanBlock=(value,max=80000)=>String(value||"").replace(/\\u0000/g,"").replace(/\\r\\n?/g,"\\n").replace(/[\\t ]+/g," ").replace(/ *\\n */g,"\\n").replace(/\\n{3,}/g,"\\n\\n").trim().slice(0,max);
const blockText=(node)=>cleanBlock(node&&(node.innerText||node.textContent));
const findPosting=(value)=>{if(!value)return null;if(Array.isArray(value)){for(const item of value){const found=findPosting(item);if(found)return found;}return null;}if(typeof value!=="object")return null;const type=value["@type"];if(type==="JobPosting"||(Array.isArray(type)&&type.includes("JobPosting")))return value;for(const item of Object.values(value)){const found=findPosting(item);if(found)return found;}return null;};
let posting=null;
for(const script of document.querySelectorAll('script[type="application/ld+json"]')){try{posting=findPosting(JSON.parse(script.textContent||""));if(posting)break;}catch{}}
const queryText=(selectors)=>{for(const selector of selectors){const value=text(document.querySelector(selector));if(value)return value;}return "";};
const candidate=(source,value,max=500)=>({source,value:clean(value,max)});
const queryCandidates=(definitions)=>definitions.map(([source,selector])=>candidate(source,text(document.querySelector(selector)))).filter((item)=>item.value);
const stripHtml=(value)=>{const box=document.createElement("div");box.innerHTML=String(value||"");return blockText(box);};
const address=(()=>{const raw=Array.isArray(posting&&posting.jobLocation)?posting.jobLocation[0]:posting&&posting.jobLocation;return raw&&raw.address||{};})();
const organization=posting&&posting.hiringOrganization;
const selected=cleanBlock(window.getSelection&&window.getSelection().toString(),80000);
const jdSelectors=['[data-automation-id="jobPostingDescription"]','[data-testid="job-posting-description"]','[data-testid*="job-description"]','[data-ui="job-description"]','#job-description','#content .job-post','main .job-description','.job-description','.job__description','.posting-description','.posting-page .section-wrapper','.job-sec-text','.job-detail-section','[class*="post-content-desc"]','[class*="job-description"]','[class*="jobDescription"]','[class*="position-detail"]'];
const queryBlock=(selectors)=>{for(const selector of selectors){const value=blockText(document.querySelector(selector));if(value&&value.length>=160)return value;}return "";};
const broad=blockText(document.querySelector('main')||document.querySelector('article'));
const jdSignals=(value)=>(String(value||"").match(/job description|responsibilit|qualifications?|requirements?|职位描述|岗位职责|工作职责|任职要求|任职资格|岗位要求/gi)||[]).length;
const description=stripHtml(posting&&posting.description)||selected||queryBlock(jdSelectors)||(jdSignals(broad)>=2?broad:"")||cleanBlock(document.body&&document.body.innerText,80000);
const rolePattern=/(?:research|applied|data|quantitative|machine learning|statistical|biostatistics?|clinical|imaging|algorithm|decision|software|full.?stack|agent)\s+(?:scientist|researcher|analyst|engineer|developer)|(?:scientist|researcher|analyst|engineer|developer),?\s+(?:research|data|ai|ml)|(?:研究|应用|数据|量化|算法|统计|生物统计|临床|影像|决策|软件|全栈|前端|后端|智能体|Agent)(?:科学家|研究员|分析师|统计师|工程师|开发)/i;
const genericTitlePattern=/(?:校园招聘|校招|社会招聘|人才招聘|招聘官网|招聘平台|招聘中心|加入我们|campus talent|campus recruiting|campus recruitment|careers?|join us)/i;
const roleHeading=Array.from(document.querySelectorAll('h1,h2,h3,[role="heading"]')).map(text).find((value)=>value&&value.length<=180&&rolePattern.test(value)&&!genericTitlePattern.test(value))||"";
const titleCandidates=[candidate("jsonld",posting&&posting.title),...queryCandidates([["job-title",'[class*="detail-title"]'],["linkedin-title",'.job-details-jobs-unified-top-card__job-title h1'],["linkedin-title",'.top-card-layout__title'],["boss-title",'.job-primary .name'],["boss-title",'.job-detail-box .job-name'],["boss-title",'.info-primary .name'],["workday-title",'[data-automation-id="jobPostingTitle"]'],["workday-title",'[data-automation-id="jobPostingHeader"] h1'],["workday-title",'[data-automation-id="jobPostingHeader"] h2'],["job-title",'[data-testid*="job-title"]'],["job-title",'[data-ui="job-title"]'],["ats-title",'.posting-headline h2'],["ats-title",'.app-title'],["job-title",'.job-name'],["job-title",'[class*="job-title"]'],["job-title",'[class*="jobTitle"]']]),candidate("role-heading",roleHeading),candidate("h1",queryText(['h1'])),candidate("og-title",(document.querySelector('meta[property="og:title"]')||{}).content),candidate("twitter-title",(document.querySelector('meta[name="twitter:title"]')||{}).content),candidate("page-title",document.title)].filter((item)=>item.value);
const companyCandidates=[candidate("jsonld",organization&&(organization.name||organization.legalName),300),...queryCandidates([["linkedin-company",'.job-details-jobs-unified-top-card__company-name a'],["linkedin-company",'.topcard__org-name-link'],["boss-company",'.job-company-name'],["boss-company",'.company-info .name'],["boss-company",'.company-card .company-name'],["company-name",'[data-testid*="company-name"]'],["ats-company",'.posting-headline .company'],["company-name",'.company-name'],["company-name",'[class*="company-name"]'],["company-name",'[class*="companyName"]'],["company-name",'a[href*="company"] h2'],["company-name",'a[href*="company"] h3']]),candidate("site-name",(document.querySelector('meta[property="og:site_name"]')||{}).content,300)].filter((item)=>item.value);
const title=(titleCandidates[0]&&titleCandidates[0].value)||"";
const company=(companyCandidates[0]&&companyCandidates[0].value)||"";
const jobLocation=clean([address.addressLocality,address.addressRegion,address.addressCountry].filter(Boolean).join(" · "),500)||queryText(['[class*="post-subtitle-item"]','[data-testid*="location"]','.job-location','.job-area','[class*="job-location"]','[class*="jobLocation"]']);
const country=clean(address.addressCountry,200);
const identifier=posting&&posting.identifier;
const params=new URL(window.location.href).searchParams;
const titleApplicationId=clean((title.match(/[（(](J\\d+)[）)]/i)||[])[1],500);
const applicationId=clean(typeof identifier==="string"?identifier:identifier&&(identifier.value||identifier.name),500)||clean(params.get("gh_jid")||params.get("jobId")||params.get("job_id")||params.get("currentJobId")||params.get("postingId")||params.get("positionId")||params.get("reqId")||params.get("requisitionId")||params.get("vacancyId"),500)||titleApplicationId;
const captureId=Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
const payload={key:${JSON.stringify(key)},jobUrl:window.location.href,title,company,titleCandidates,companyCandidates,location:jobLocation,description,applicationId,addressCountry:country,sourcePageTitle:document.title,captureId,bookmarkVersion:"v6"};
const captureUrl=new URL(${JSON.stringify(capturePageUrl)});
let popup=null;
let sent=false;
const listener=(event)=>{if(sent||event.source!==popup||event.origin!==captureUrl.origin||event.data!=="ivy-job-radar-ready")return;sent=true;window.removeEventListener("message",listener);popup.postMessage({type:"ivy-job-radar-capture",payload},captureUrl.origin);};
window.addEventListener("message",listener);
const popupName="ivy_job_radar_capture_"+captureId;
popup=window.open(captureUrl.href,popupName,"popup,width=600,height=760");
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
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "clamp(38px, 7vw, 70px)", lineHeight: 1.02, margin: "12px 0 20px" }}>浏览岗位时，一键加入收藏</h1>
        <p style={{ maxWidth: 680, fontSize: 18, lineHeight: 1.75, color: "#536159" }}>
          把下面的按钮拖到 Chrome 书签栏。以后在 LinkedIn、BOSS、猎聘、公司官网或其他招聘页面看到岗位，点击书签只会加入收藏。之后由你决定是否进入待申请并生成 CV。
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
                style={{ display: "inline-flex", alignItems: "center", gap: 10, marginTop: 14, borderRadius: 999, padding: "15px 22px", background: "#16794b", color: "white", textDecoration: "none", fontWeight: 850, boxShadow: "0 10px 28px rgba(22,121,75,.25)", cursor: "grab" }}
              >
                ＋ 保存到收藏
              </a>
              <button type="button" onClick={() => void copyCode()} style={{ marginLeft: 10, border: "1px solid #cfcabe", borderRadius: 999, padding: "14px 18px", background: "#f7f5ef", fontWeight: 750, cursor: "pointer" }}>
                {copied ? "已复制" : "无法拖动时复制代码"}
              </button>
            </>
          )}
        </article>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginTop: 20 }}>
          {[
            ["只进收藏", "书签保存不会建立申请记录，也不会调用 CV API。"],
            ["连续保存", "每次点击都有独立保存身份，可连续保存多个岗位，不需要等待一分钟。"],
            ["自动去重", "优先按 Requisition ID；招聘门户只显示通用标题时，再按完整 JD 内容识别。"],
          ].map(([title, body]) => (
            <article key={title} style={{ background: "rgba(255,255,255,.68)", border: "1px solid #ded9ce", borderRadius: 18, padding: 20 }}>
              <strong>{title}</strong><p style={{ marginBottom: 0, lineHeight: 1.6, color: "#647169" }}>{body}</p>
            </article>
          ))}
        </div>
        <p style={{ marginTop: 24, color: "#758078", fontSize: 13 }}>
          书签中只包含一个专用于保存岗位的派生密钥，不包含 Job Radar 的原始同步密钥。
        </p>
      </section>
    </main>
  );
}
