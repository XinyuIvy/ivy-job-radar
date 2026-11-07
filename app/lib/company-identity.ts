const companyAliases: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(?:alibaba|alibabagroup|alibabahealth|阿里巴巴|阿里健康|淘天集团)/, "alibaba"],
  [/^(?:tencent|腾讯|腾讯医疗健康)/, "tencent"],
  [/^(?:bytedance|字节跳动|字节)/, "bytedance"],
  [/^(?:meituan|美团)/, "meituan"],
  [/^(?:huawei|华为|华为运动健康)/, "huawei"],
  [/^(?:oppo|欧珀)/, "oppo"],
  [/^(?:baidu|百度)/, "baidu"],
  [/^(?:xiaomi|小米)/, "xiaomi"],
  [/^(?:netease|网易)/, "netease"],
  [/^(?:kuaishou|快手)/, "kuaishou"],
  [/^(?:jdcom|jingdong|京东)/, "jd"],
  [/^(?:tripcom|ctrip|携程)/, "trip"],
  [/^(?:pingan|中国平安|平安)/, "pingan"],
];

const companySuffixes = /(?:incorporated|corporation|company|limited|holdings?|group|technology|technologies|healthcare|health|medical|pharma|pharmaceuticals?|biotech|china|中国|集团|控股|科技|技术|医疗健康|医疗|医药|制药|股份|有限责任公司|有限公司)+$/g;

export function canonicalCompanyIdentity(value: string) {
  const normalized = value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "")
    .replace(companySuffixes, "");
  for (const [pattern, canonical] of companyAliases) {
    if (pattern.test(normalized)) return canonical;
  }
  return normalized;
}

export function sameCompanyIdentity(left: string, right: string) {
  const leftIdentity = canonicalCompanyIdentity(left);
  const rightIdentity = canonicalCompanyIdentity(right);
  return Boolean(leftIdentity && rightIdentity && leftIdentity === rightIdentity);
}

export function isChinaCompanyIdentity(value: string) {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  if (/[\u3400-\u9fff]/.test(normalized)) return true;
  const identity = canonicalCompanyIdentity(value);
  return new Set([
    "alibaba", "tencent", "bytedance", "meituan", "huawei", "oppo", "baidu",
    "xiaomi", "netease", "kuaishou", "jd", "trip", "pingan",
  ]).has(identity);
}
