export type DeadlineType = "date" | "rolling" | "unknown";

export type DeadlineExtraction = {
  deadline: string;
  deadlineType: DeadlineType;
};

const rollingPattern = /rolling basis|rolling applications?|applications? reviewed on a rolling basis|open until filled|until filled|滚动招聘|招满即止|长期有效|长期招聘/i;
const deadlineSignal = /deadline|apply by|applications? close|closing date|last date to apply|截止(?:日期|时间)?|申请截止|报名截止/i;

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isoDate(year: number, month: number, day: number) {
  if (!validDate(year, month, day)) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateCandidate(value: string) {
  let match = value.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (match) return isoDate(Number(match[3]), Number(match[1]), Number(match[2]));

  match = value.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (match) return isoDate(Number(match[1]), Number(match[2]), Number(match[3]));

  const months: Record<string, number> = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  };
  match = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(20\d{2})\b/i);
  if (match) return isoDate(Number(match[3]), months[match[1].toLowerCase()], Number(match[2]));

  return "";
}

export function extractDeadline(raw: string): DeadlineExtraction {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { deadline: "", deadlineType: "unknown" };

  const signals = Array.from(text.matchAll(new RegExp(deadlineSignal.source, "gi")));
  for (const signal of signals) {
    const start = Math.max(0, (signal.index ?? 0) - 20);
    const candidate = text.slice(start, Math.min(text.length, (signal.index ?? 0) + 140));
    const parsed = parseDateCandidate(candidate);
    if (parsed) return { deadline: parsed, deadlineType: "date" };
  }

  if (rollingPattern.test(text)) return { deadline: "", deadlineType: "rolling" };
  return { deadline: "", deadlineType: "unknown" };
}
