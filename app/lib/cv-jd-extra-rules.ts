import type { RequirementRule } from "./hybrid-rag.ts";

// Cross-industry research/AI requirements that should remain independent atoms.
// These are not Alibaba-specific claims; the aliases capture common Chinese JD language.
export const CV_JD_EXTRA_RULES: RequirementRule[] = [
  { label: "Code generation", category: "AI Systems", aliases: ["code generation", "代码生成"] },
  { label: "Experiment execution", category: "Research", aliases: ["experiment execution", "execute experiments", "实验执行"] },
  { label: "Error fixing", category: "Engineering", aliases: ["error fixing", "debugging", "错误修复", "故障修复"] },
  { label: "Training and evaluation loop", category: "AI Systems", aliases: ["training and evaluation loop", "training-evaluation loop", "训练与评测闭环", "训练评测闭环"] },
  { label: "Model robustness", category: "Methods", aliases: ["model robustness", "robust models", "模型鲁棒性", "模型稳健性"], projectTerms: ["robustness", "sensitivity analysis", "稳健性", "敏感性分析"] },
  { label: "Algorithm implementation", category: "Engineering", aliases: ["algorithm implementation", "implement algorithms", "算法实现"] },
  { label: "Automated research", category: "AI Systems", aliases: ["automated research", "automated scientific research", "自动化科研", "自动科研"] },
  { label: "Automated reasoning", category: "AI Systems", aliases: ["automated reasoning", "automatic reasoning", "自动化推理", "自动推理"] },
  { label: "Theoretical background", category: "Research", aliases: ["theoretical background", "strong theory", "扎实理论背景", "理论背景"] },
  { label: "Innovation", category: "Research", aliases: ["innovation", "innovative", "创新", "创新能力"] },
  { label: "Communication and collaboration", category: "Collaboration", aliases: ["communication and collaboration", "communication skills", "沟通协作", "沟通合作", "沟通能力"] },
];
