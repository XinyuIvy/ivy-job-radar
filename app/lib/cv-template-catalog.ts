export type CvTemplateLanguage = "zh" | "en";
export type CvTemplateTrack = "tech" | "quant" | "consulting" | "pharma" | "clinical_neuro";

export type CvTemplateOption = {
  filename: string;
  path: string;
  label: string;
  language: CvTemplateLanguage;
  track: CvTemplateTrack;
};

export const CV_TEMPLATE_DIRECTORY = "master/template-cv";

export function isCvTemplateFilename(value: unknown) {
  const filename = String(value ?? "").trim();
  return /^[\p{L}\p{N}][\p{L}\p{N} ._()+-]*\.tex$/u.test(filename)
    && !filename.includes("/")
    && !filename.includes("\\");
}

export function inferCvTemplateLanguage(filename: string): CvTemplateLanguage {
  const normalized = filename.normalize("NFKC").toLocaleLowerCase();
  if (/(?:中文|chinese|(?:^|[_ .-])(?:cn|zh)(?:[_ .-]|$))/.test(normalized)) return "zh";
  if (/(?:english|(?:^|[_ .-])en(?:[_ .-]|$))/.test(normalized)) return "en";
  return /[\u3400-\u9fff]/.test(normalized) ? "zh" : "en";
}

export function inferCvTemplateTrack(value: string): CvTemplateTrack {
  const normalized = value.normalize("NFKC").toLocaleLowerCase();
  if (/quant|量化|定量|systematic/.test(normalized)) return "quant";
  if (/consult|咨询|strategy|战略/.test(normalized)) return "consulting";
  if (/neuro|brain|imaging|影像|神经|脑科学|medical.?device|医疗器械/.test(normalized)) return "clinical_neuro";
  if (/pharma|biostat|clinical|epidemi|rwe|heor|医药|生物统计|临床|流行病/.test(normalized)) return "pharma";
  return "tech";
}

export function cvTemplateLabel(filename: string) {
  return filename
    .replace(/\.tex$/i, "")
    .replace(/^cv[_ .-]*/i, "")
    .replace(/(?:[_ .-](?:cn|zh|en)|[_ .-]*(?:中文|english|chinese))$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || filename;
}

export function createCvTemplateOption(filename: string): CvTemplateOption | null {
  if (!isCvTemplateFilename(filename)) return null;
  return {
    filename,
    path: `${CV_TEMPLATE_DIRECTORY}/${filename}`,
    label: cvTemplateLabel(filename),
    language: inferCvTemplateLanguage(filename),
    track: inferCvTemplateTrack(filename),
  };
}

export function sortCvTemplateOptions(options: CvTemplateOption[]) {
  return [...options].sort((left, right) =>
    left.language.localeCompare(right.language)
    || left.label.localeCompare(right.label, left.language === "zh" ? "zh-CN" : "en"));
}

const recommendationSignals: Array<{ job: RegExp; template: RegExp }> = [
  { job: /biostat|生物统计/, template: /biostat|生物统计/ },
  { job: /agent|智能体/, template: /agent|智能体/ },
  { job: /healthcare|health|medical|医疗|健康/, template: /healthcare|health|medical|医疗|健康/ },
  { job: /internet|product|growth|互联网|增长|产品/, template: /internet|product|growth|互联网|增长|产品/ },
  { job: /finance|financial|business|金融|商业/, template: /finance|financial|business|金融|商业/ },
  { job: /machine.?learning|\bml\b|算法/, template: /machine.?learning|\bml\b|算法/ },
  { job: /data.?scien|数据科学/, template: /data.?scien|数据科学|\bds\b/ },
  { job: /quant|量化|定量|systematic/, template: /quant|量化|定量|systematic/ },
  { job: /consult|咨询|strategy|战略/, template: /consult|咨询|strategy|战略/ },
  { job: /neuro|brain|imaging|影像|神经|脑科学/, template: /neuro|brain|imaging|影像|神经|脑科学/ },
  { job: /pharma|clinical|epidemi|rwe|heor|医药|临床|流行病/, template: /pharma|clinical|epidemi|rwe|heor|医药|临床|流行病/ },
];

export function recommendCvTemplateOption(
  options: CvTemplateOption[],
  language: CvTemplateLanguage,
  jobSignal: string,
) {
  const candidates = options.filter((option) => option.language === language);
  if (!candidates.length) return null;
  const signal = jobSignal.normalize("NFKC").toLocaleLowerCase();
  const preferredTrack = inferCvTemplateTrack(signal);
  return [...candidates].sort((left, right) => {
    const score = (option: CvTemplateOption) => {
      const template = `${option.filename} ${option.label}`.normalize("NFKC").toLocaleLowerCase();
      const signalScore = recommendationSignals.reduce(
        (total, rule) => total + (rule.job.test(signal) && rule.template.test(template) ? 20 : 0),
        0,
      );
      const trackScore = option.track === preferredTrack ? 6 : 0;
      const generalScore = /general|通用/.test(template) ? 1 : 0;
      return signalScore + trackScore + generalScore;
    };
    return score(right) - score(left) || left.label.localeCompare(right.label);
  })[0];
}

export async function fetchCvTemplateCatalog() {
  const response = await fetch("/api/cv-templates", { cache: "no-store" });
  const result = await response.json() as { templates?: CvTemplateOption[]; error?: string };
  if (!response.ok || !Array.isArray(result.templates)) {
    throw new Error(result.error || "CV 母版清单读取失败。");
  }
  return result.templates;
}
