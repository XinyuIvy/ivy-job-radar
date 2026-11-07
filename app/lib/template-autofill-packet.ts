type ParsedDateRange = {
  start_year: string;
  start_month: string;
  end_year: string;
  end_month: string;
  current: boolean;
};

type TemplateEntry = ParsedDateRange & {
  name: string;
  role: string;
  location: string;
  bullets: string[];
  links: Array<{ url: string }>;
};

type TemplateSkillCategory = {
  category: string;
  items: string[];
};

export function hasTemplateAutofillProjects(packet: unknown) {
  if (!packet || typeof packet !== "object") return false;
  const projects = (packet as { projects?: unknown }).projects;
  return Array.isArray(projects) && projects.length > 0;
}

const MONTHS: Record<string, string> = {
  jan: "01", january: "01", feb: "02", february: "02", mar: "03", march: "03",
  apr: "04", april: "04", may: "05", jun: "06", june: "06", jul: "07", july: "07",
  aug: "08", august: "08", sep: "09", sept: "09", september: "09", oct: "10", october: "10",
  nov: "11", november: "11", dec: "12", december: "12",
};

function stripLatex(value: string) {
  return value
    .replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, "$2")
    .replace(/\\(?:textbf|emph|texttt|underline)\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:Large|large|small|normalsize|bfseries|itshape)\b/g, "")
    .replace(/\$\\mid\$/g, "|")
    .replace(/\\(?:enspace|quad|qquad|hfill|par|noindent)\b/g, " ")
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&")
    .replace(/\\_/g, "_")
    .replace(/\\textasciitilde\{\}/g, "~")
    .replace(/[{}$]/g, "")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateTokens(value: string) {
  const tokens: Array<{ year: string; month: string }> = [];
  for (const match of value.matchAll(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+((?:19|20)\d{2})\b/gi)) {
    tokens.push({ year: match[2], month: MONTHS[match[1].toLowerCase().replace(/\.$/, "")] || "" });
  }
  if (tokens.length) return tokens;
  for (const match of value.matchAll(/((?:19|20)\d{2})\s*(?:年|[.\/-])?\s*(0?[1-9]|1[0-2])?\s*(?:月)?/g)) {
    tokens.push({ year: match[1], month: match[2] ? match[2].padStart(2, "0") : "" });
  }
  return tokens;
}

function parseDateRange(value: string): ParsedDateRange {
  let tokens = dateTokens(value);
  if (tokens.length < 2) {
    const sameYearChinese = value.match(/((?:19|20)\d{2})\s*年?\s*(0?[1-9]|1[0-2])\s*月?\s*[-~至到]+\s*(0?[1-9]|1[0-2])\s*月?/);
    if (sameYearChinese) {
      tokens = [
        { year: sameYearChinese[1], month: sameYearChinese[2].padStart(2, "0") },
        { year: sameYearChinese[1], month: sameYearChinese[3].padStart(2, "0") },
      ];
    }
    const sameYearEnglish = value.match(/\b([A-Za-z]+)\.?\s*[-~]+\s*([A-Za-z]+)\.?\s+((?:19|20)\d{2})\b/);
    if (sameYearEnglish && MONTHS[sameYearEnglish[1].toLowerCase()] && MONTHS[sameYearEnglish[2].toLowerCase()]) {
      tokens = [
        { year: sameYearEnglish[3], month: MONTHS[sameYearEnglish[1].toLowerCase()] },
        { year: sameYearEnglish[3], month: MONTHS[sameYearEnglish[2].toLowerCase()] },
      ];
    }
  }
  const current = /至今|现在|present|current|ongoing/i.test(value);
  return {
    start_year: tokens[0]?.year || "",
    start_month: tokens[0]?.month || "",
    end_year: current ? "" : tokens[1]?.year || "",
    end_month: current ? "" : tokens[1]?.month || "",
    current,
  };
}

function sectionKind(title: string) {
  const normalized = stripLatex(title).toLowerCase();
  if (/行业经历|实习经历|工作经历|职业经历|professional experience|industry experience|work experience|internship/.test(normalized)) return "experience";
  if (/个人简介|summary|profile|教育|education|技能|skills|论文|publication|荣誉|honou?r|award|学术活动|software implementation|软件实现|跨领域协作/.test(normalized)) return "other";
  return "project";
}

function isSkillsSection(title: string) {
  return /专业技能|技术技能|技能清单|technical skills?|professional skills?/i.test(stripLatex(title));
}

function sectionBlocks(latex: string) {
  const matches = [...latex.matchAll(/\\section\*\{([^\n]+)\}/g)];
  return matches.map((match, index) => ({
    title: match[1],
    body: latex.slice((match.index || 0) + match[0].length, matches[index + 1]?.index ?? latex.length),
  }));
}

function entryLinks(value: string) {
  return [...value.matchAll(/\\href\{([^}]*)\}\{[^}]*\}/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .map((url) => ({ url }));
}

function parseSkills(body: string): TemplateSkillCategory[] {
  const categories: TemplateSkillCategory[] = [];
  const linePattern = /\\noindent\s*\\textbf\{([^{}\n]+)\}\s*([^\n]+)/g;
  for (const match of body.matchAll(linePattern)) {
    const category = stripLatex(match[1]).replace(/[:：]\s*$/, "").trim();
    const items = stripLatex(match[2])
      .replace(/\\\\/g, " ")
      .split(/[;；]/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (items.length) categories.push({ category, items });
  }
  return categories;
}

function parseEntries(body: string): TemplateEntry[] {
  const entryPattern = /\\noindent\s*\\textbf\{([^\n{}]+)\}(?:\s*\$\\mid\$\s*([\s\S]*?))?\s*\\hfill\s*([\s\S]*?)(?:\\par)?\s*\\begin\{itemize\}(?:\[[^\]]*\])?([\s\S]*?)\\end\{itemize\}/g;
  return [...body.matchAll(entryPattern)].map((match) => {
    const headerMiddle = stripLatex(match[2] || "");
    const role = headerMiddle.split("|").map((part) => part.trim()).find(Boolean) || headerMiddle;
    const tail = stripLatex(match[3]);
    const tailParts = tail.split("|").map((part) => part.trim()).filter(Boolean);
    const datePart = tailParts.find((part) => /(?:19|20)\d{2}/.test(part)) || tail;
    const bullets = match[4].split(/\\item\s+/).slice(1).map(stripLatex).filter(Boolean);
    return {
      name: stripLatex(match[1]),
      role,
      location: tailParts.length > 1 ? tailParts.filter((part) => part !== datePart).join(" | ") : "",
      bullets,
      links: entryLinks(match[0]),
      ...parseDateRange(datePart),
    };
  }).filter((entry) => entry.name && entry.bullets.length);
}

export function buildTemplateAutofillPacket(input: {
  archiveId: string;
  templateFile: string;
  cvCommit: string;
  latex: string;
  authority?: "final_customized_cv_only" | "frozen_submitted_template" | "live_cv_template";
  provenance?: "final_customized_cv" | "frozen_submitted_template" | "refreshed_template_autofill" | "live_template";
  refreshedAt?: string;
}) {
  const experience: TemplateEntry[] = [];
  const projects: TemplateEntry[] = [];
  const skills: TemplateSkillCategory[] = [];
  const summaries: string[] = [];
  for (const section of sectionBlocks(input.latex.replace(/^\s*%.*$/gm, ""))) {
    if (/^(个人简介|个人概述|summary|professional summary|profile)$/i.test(stripLatex(section.title).trim())) {
      const text=stripLatex(section.body.replace(/\\end\{document\}[\s\S]*$/, ''));
      if(text)summaries.push(text);
      continue;
    }
    if (isSkillsSection(section.title)) {
      skills.push(...parseSkills(section.body));
      continue;
    }
    const kind = sectionKind(section.title);
    if (kind === "other") continue;
    const entries = parseEntries(section.body);
    if (kind === "experience") experience.push(...entries);
    else projects.push(...entries);
  }
  return {
    schema_version: "application-autofill-v1",
    application_id: input.archiveId,
    // Frozen packets default to the legacy authority for installed extension compatibility.
    // Explicit live-template packets use their own authority and provenance.
    authority: input.authority || "final_customized_cv_only",
    provenance: input.provenance || "frozen_submitted_template",
    refreshed_at: input.refreshedAt || "",
    source_cv: {
      kind: "selected_template",
      template_file: input.templateFile,
      cv_commit: input.cvCommit,
    },
    experience: experience.map((entry) => ({
      organization: entry.name,
      title: entry.role,
      location: entry.location,
      start_year: entry.start_year,
      start_month: entry.start_month,
      end_year: entry.end_year,
      end_month: entry.end_month,
      current: entry.current,
      bullets: entry.bullets,
    })),
    projects,
    skills,
    // Selected CV only. Multiple profile sections are ambiguous; do not merge.
    summary: summaries.length===1?summaries[0]:'',
  };
}
