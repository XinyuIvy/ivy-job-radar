import type { Plugin } from "vite";


const TARGET_MODULE = "/app/job-radar.tsx";
const OBSOLETE_LABELS = [
  '  salary_below_20k: "工资下限不足 20K",\n',
  '  salary_below_20k_or_missing: "工资不足或缺失",\n',
] as const;
const OLD_PROGRESS_COPY = "排除原因：缺少标题或链接 {chinaProgress.rejectionReasons.missing_title_or_url ?? chinaProgress.rejectionReasons.missing_required_fields ?? 0}；关键词不匹配 {chinaProgress.rejectionReasons.title_not_targeted ?? 0}；高年资、工程类或无关岗位 {chinaProgress.rejectionReasons.excluded_seniority_or_role ?? 0}；经验超过 3 年或核心方向不符 {chinaProgress.rejectionReasons.degree_experience_or_skill_gap ?? 0}；明确工资下限不足 20K {chinaProgress.rejectionReasons.salary_below_20k ?? chinaProgress.rejectionReasons.salary_below_20k_or_missing ?? 0}。保留待核验：工资缺失或面议 {chinaProgress.reviewCounts?.salary_missing_or_negotiable ?? chinaProgress.rejectionReasons.salary_missing_or_negotiable ?? 0}。";
const NEW_PROGRESS_COPY = "排除原因：缺少标题或链接 {chinaProgress.rejectionReasons.missing_title_or_url ?? chinaProgress.rejectionReasons.missing_required_fields ?? 0}；关键词不匹配 {chinaProgress.rejectionReasons.title_not_targeted ?? 0}；高年资、工程类或无关岗位 {chinaProgress.rejectionReasons.excluded_seniority_or_role ?? 0}；经验超过 3 年或核心方向不符 {chinaProgress.rejectionReasons.degree_experience_or_skill_gap ?? 0}。工资字段仅用于展示和待核验，不参与自动排除；工资缺失或面议 {chinaProgress.reviewCounts?.salary_missing_or_negotiable ?? chinaProgress.rejectionReasons.salary_missing_or_negotiable ?? 0}。";


export function salaryPolicyUi(): Plugin {
  return {
    name: "ivy-salary-policy-ui",
    enforce: "pre",
    transform(code, id) {
      const moduleId = id.split("?", 1)[0].replaceAll("\\", "/");
      if (!moduleId.endsWith(TARGET_MODULE)) return null;

      let transformed = code;
      for (const obsoleteLabel of OBSOLETE_LABELS) {
        if (!transformed.includes(obsoleteLabel)) {
          throw new Error(`Missing expected obsolete salary label in ${moduleId}`);
        }
        transformed = transformed.replace(obsoleteLabel, "");
      }
      if (!transformed.includes(OLD_PROGRESS_COPY)) {
        throw new Error(`Missing expected China progress copy in ${moduleId}`);
      }
      transformed = transformed.replace(OLD_PROGRESS_COPY, NEW_PROGRESS_COPY);
      return { code: transformed, map: null };
    },
  };
}
