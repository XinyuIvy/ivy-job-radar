import fs from "node:fs";

const poolPath = new URL("../app/company-pool.json", import.meta.url);
const additionsPath = new URL("../app/company-pool-additions.json", import.meta.url);
const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
const additions = JSON.parse(fs.readFileSync(additionsPath, "utf8"));

const requested = [
  "费森尤斯卡比", "爱尔眼科", "利洁时", "雷允上", "伊利集团", "九州通", "华南生物", "康弘药业", "合元集团", "旺旺",
  "罗氏诊断", "金斯瑞", "正大天晴", "百奥赛图", "普洛药业", "药明生物", "京东方", "美迪西生物", "普瑞生物", "迈微医疗",
  "津石医药", "国药集团", "华海药业", "三生制药", "湃肽生物", "皓元医药", "复星医药", "复宏汉霖", "九洲药业", "卫材",
  "徕博科", "都正生物", "人福医药", "邯郸制药", "国邦医药", "广药集团", "方舟健客", "勃林格殷格翰", "百联集团", "亿滋",
  "丹纳赫", "上海医药", "百事", "百威", "甘李药业", "鲁南制药", "东阳光", "达能", "招商局集团", "柳药集团",
  "华润双鹤", "宝洁", "汇丰", "新风天域", "三诺生物", "京新药业", "哈药集团", "维亚生物", "雀巢", "联合利华",
  "雅诗兰黛", "易方达", "蒙牛", "新和成", "药明合联"
];

const diagnostics = new Set(["罗氏诊断", "丹纳赫", "三诺生物", "迈微医疗", "京东方"]);
const digitalHealth = new Set(["方舟健客"]);
const providers = new Set(["爱尔眼科", "新风天域"]);
const consumerHealth = new Set(["利洁时", "宝洁", "联合利华", "雅诗兰黛"]);
const pharma = new Set([
  "费森尤斯卡比", "雷允上", "九州通", "华南生物", "康弘药业", "合元集团", "金斯瑞", "正大天晴", "百奥赛图", "普洛药业",
  "药明生物", "美迪西生物", "普瑞生物", "津石医药", "国药集团", "华海药业", "三生制药", "湃肽生物", "皓元医药", "复星医药",
  "复宏汉霖", "九洲药业", "卫材", "徕博科", "都正生物", "人福医药", "邯郸制药", "国邦医药", "广药集团", "勃林格殷格翰",
  "上海医药", "甘李药业", "鲁南制药", "东阳光", "柳药集团", "华润双鹤", "京新药业", "哈药集团", "维亚生物", "新和成", "药明合联"
]);

const aliases = {
  "费森尤斯卡比": ["Fresenius Kabi"], "利洁时": ["Reckitt"], "罗氏诊断": ["Roche Diagnostics"], "金斯瑞": ["GenScript"],
  "药明生物": ["WuXi Biologics"], "美迪西生物": ["Medicilon"], "国药集团": ["Sinopharm"], "三生制药": ["3SBio"],
  "复宏汉霖": ["Henlius"], "卫材": ["Eisai"], "勃林格殷格翰": ["Boehringer Ingelheim"], "丹纳赫": ["Danaher"],
  "宝洁": ["Procter & Gamble", "P&G"], "联合利华": ["Unilever"], "雅诗兰黛": ["Estée Lauder", "Estee Lauder"],
  "药明合联": ["WuXi XDC"], "费森尤斯卡比": ["Fresenius Kabi"], "卫材": ["Eisai"]
};

const norm = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
const existing = new Set([...pool, ...additions].flatMap((row) => [row.company, ...(row.aliases || [])]).map(norm));
let nextRank = Math.max(...additions.map((row) => Number(row.rank) || 0)) + 1;

for (const company of requested) {
  if (existing.has(norm(company))) continue;
  let priority = "P3";
  let fit = 1;
  let track = "监控清单（非目标行业）";
  let companyType = "跨行业雇主";
  let keywords = "Clinical Research; Biostatistics; RWE; Medical Data Science; Healthcare AI";
  let dataTypes = "仅监控与医疗健康直接相关的岗位";
  let reason = "用户从2027届秋招汇总图补充；保留在公司池，但只接收医疗健康目标范围内的岗位。";

  if (pharma.has(company)) {
    priority = "P1";
    fit = 5;
    track = "1 临床开发生物统计";
    companyType = "Pharma / Biotech / CRO";
    keywords = "Biostatistician; Statistical Scientist; Clinical Research; Quantitative Pharmacology; RWE; Epidemiology; HEOR";
    dataTypes = "Biostatistics / Statistical Science; Clinical Development; RWE / Epidemiology / HEOR";
    reason = "用户从2027届医药秋招汇总图补充，属于重点医药/生物科技/CRO监控对象。";
  } else if (diagnostics.has(company)) {
    priority = "P1";
    fit = 5;
    track = "6 Diagnostics / IVD";
    companyType = "Medical Device / Diagnostics / IVD";
    keywords = "Clinical Scientist; Biostatistician; Medical Data Scientist; Diagnostics; IVD; Evidence Generation";
    dataTypes = "Diagnostics / IVD; Medical Data Science; Clinical Evidence";
    reason = "用户从2027届医药秋招汇总图补充，重点监控诊断、器械和临床证据岗位。";
  } else if (digitalHealth.has(company)) {
    priority = "P2";
    fit = 4;
    track = "8 Healthcare Data Science";
    companyType = "Digital Health";
    keywords = "Healthcare Data Scientist; Clinical Data Scientist; RWE; Epidemiology; Medical AI";
    dataTypes = "Healthcare / Clinical Data Science";
    reason = "用户从2027届秋招汇总图补充，限医疗健康数据科学及研究岗位。";
  } else if (consumerHealth.has(company)) {
    priority = "P2";
    fit = 3;
    track = "9 Skin Health / Aesthetics Research";
    companyType = "Consumer Health / Skin Health";
    keywords = "Clinical Research; Skin Health; Dermatology; Biostatistics; Medical Data Science";
    dataTypes = "Skin Health / Consumer Health Research";
    reason = "用户指定持续监控；只接收皮肤健康、消费者健康科研或临床数据岗位。";
  } else if (providers.has(company)) {
    priority = "P3";
    fit = 1;
    track = "监控清单（医院/医疗服务排除）";
    companyType = "Healthcare Provider";
    dataTypes = "公司级监控；医院和医疗中心岗位按硬规则排除";
    reason = "用户要求加入公司池；因医院/医疗中心属于硬性排除，仅保留公司级监控记录。";
  }

  additions.push({
    rank: nextRank++, region: "中国", priority, track, fit, company,
    ...(aliases[company] ? { aliases: aliases[company] } : {}),
    companyType, keywords, reason, dataTypes,
    strategy: "仅将官网或官方ATS仍开放、符合0至3年经验且不在已申请记录中的岗位加入今日岗位；第三方只用于发现。",
    source: "用户上传的2027届医药秋招汇总图（2026-09-23）"
  });
  existing.add(norm(company));
}

fs.writeFileSync(additionsPath, `${JSON.stringify(additions, null, 2)}\n`);
console.log(JSON.stringify({ total: additions.length, added: additions.filter((row) => row.rank >= 411).length, lastRank: nextRank - 1 }, null, 2));
