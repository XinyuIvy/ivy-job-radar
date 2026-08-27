export type JobDescriptionExtraction = {
  text: string;
  method: "empty" | "unchanged" | "section-markers" | "tail-trimmed";
  removedBefore: number;
  removedAfter: number;
};

const START_MARKERS = [
  /\bjob description\b/gi,
  /\bposition description\b/gi,
  /\brole description\b/gi,
  /\babout (?:the|this) (?:job|role|opportunity)\b/gi,
  /\bthe (?:role|opportunity)\b/gi,
  /\bposition summary\b/gi,
  /\brole overview\b/gi,
  /职位描述|岗位描述|岗位详情|职位详情|岗位介绍|职位介绍|工作职责|岗位职责|职位职责|工作内容/gi,
];

const END_MARKERS = [
  /\bequal opportunity employer\b/gi,
  /\bwe are an equal opportunity\b/gi,
  /\beeoc? statement\b/gi,
  /\bapplicant privacy (?:notice|policy)\b/gi,
  /\bcandidate privacy (?:notice|policy)\b/gi,
  /\bprivacy notice for applicants\b/gi,
  /\bsign up for job alerts\b/gi,
  /\bsimilar jobs\b/gi,
  /\brelated jobs\b/gi,
  /\brecommended jobs\b/gi,
  /\bshare this job\b/gi,
  /隐私政策|隐私声明|用户协议|推荐职位|职位推荐|相似职位|相关职位|更多职位|猜你喜欢|举报此职位/gi,
];

const CORE_HEADINGS = [
  /\bjob description\b/i,
  /\bposition description\b/i,
  /\babout (?:the|this) (?:job|role|opportunity)\b/i,
  /\bresponsibilit(?:y|ies)\b/i,
  /\bwhat you(?:'|’)ll do\b/i,
  /\bwhat you will do\b/i,
  /\bqualifications?\b/i,
  /\brequirements?\b/i,
  /\bwhat (?:you|we)(?:'|’)re looking for\b/i,
  /\bpreferred qualifications?\b/i,
  /\bminimum qualifications?\b/i,
  /\bskills?\b/i,
  /\beducation\b/i,
  /职位描述|岗位描述|岗位详情|职位详情|岗位介绍|职位介绍/i,
  /岗位职责|工作职责|职位职责|工作内容/i,
  /任职要求|任职资格|岗位要求|职位要求|资格要求/i,
  /优先条件|优先考虑|加分项/i,
  /技能要求|学历要求|专业要求/i,
];

const UI_ONLY_LINE = /^(?:home|jobs?|careers?|search jobs?|back to jobs?|apply|apply now|save|share|sign in|log in|首页|职位|岗位|招聘|搜索职位|返回职位列表|立即申请|申请职位|收藏|分享|登录|注册)$/i;

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  bull: "•",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "\u2014",
  middot: "·",
  nbsp: " ",
  ndash: "\u2013",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
};

function decodeHtmlEntitiesOnce(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#")) {
      const radix = normalized.startsWith("#x") ? 16 : 10;
      const digits = normalized.slice(radix === 16 ? 2 : 1);
      const codePoint = Number.parseInt(digits, radix);
      if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return match;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return match;
      }
    }
    return NAMED_HTML_ENTITIES[normalized] ?? match;
  });
}

function decodeHtmlEntities(value: string) {
  let decoded = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = decodeHtmlEntitiesOnce(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function htmlToPlainText(value: string) {
  const decoded = decodeHtmlEntities(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(?:p|div|h[1-6]|section|article|ul|ol|table|tr)\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "• ")
    .replace(/<\/\s*(?:li|td|th)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(decoded);
}

function normalizeDescription(value: unknown, maximum = 80_000) {
  return htmlToPlainText(String(value ?? ""))
    .replace(/\u0000/g, "")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maximum);
}

function markerIndexes(text: string, patterns: RegExp[]) {
  const indexes = new Set<number>();
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (typeof match.index === "number") indexes.add(match.index);
    }
  }
  return [...indexes].sort((left, right) => left - right);
}

function firstEndIndex(text: string, start: number) {
  let end = text.length;
  for (const pattern of END_MARKERS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      if (typeof match.index === "number" && match.index > start + 60 && match.index < end) {
        end = match.index;
      }
    }
  }
  return end;
}

function coreHeadingCount(text: string) {
  return CORE_HEADINGS.reduce((count, pattern) => count + Number(pattern.test(text)), 0);
}

function cleanLines(text: string) {
  const result: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || UI_ONLY_LINE.test(line)) continue;
    if (result.at(-1)?.toLocaleLowerCase() === line.toLocaleLowerCase()) continue;
    result.push(line);
  }
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function tailTrim(text: string) {
  const end = firstEndIndex(text, 0);
  return end < text.length ? text.slice(0, end).trim() : text;
}

export function extractCoreJobDescription(value: unknown): JobDescriptionExtraction {
  const raw = normalizeDescription(value);
  if (!raw) return { text: "", method: "empty", removedBefore: 0, removedAfter: 0 };

  const starts = markerIndexes(raw, START_MARKERS);
  let best: { start: number; end: number; text: string; score: number } | null = null;
  for (const start of starts) {
    const end = firstEndIndex(raw, start);
    const candidate = cleanLines(raw.slice(start, end));
    if (candidate.length < 60) continue;
    const headingCount = coreHeadingCount(candidate);
    const score = headingCount * 1_000 - candidate.length / 1_000;
    if (!best || score > best.score) best = { start, end, text: candidate, score };
  }

  if (best) {
    return {
      text: best.text.slice(0, 50_000),
      method: "section-markers",
      removedBefore: best.start,
      removedAfter: raw.length - best.end,
    };
  }

  const trimmed = cleanLines(tailTrim(raw));
  return {
    text: trimmed.slice(0, 50_000),
    method: trimmed.length < raw.length ? "tail-trimmed" : "unchanged",
    removedBefore: 0,
    removedAfter: Math.max(0, raw.length - trimmed.length),
  };
}
