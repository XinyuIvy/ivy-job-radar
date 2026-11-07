export const CV_GENERATION_RULES_MAX_LENGTH = 12_000;

export const DEFAULT_CV_GENERATION_RULES = `这是 prompt-v1.9.4-site.3 之上的可编辑附加偏好，不替代共享合同。

- 从目标行业资深招聘官视角判断岗位画像、证据强弱、差距和内容优先级。
- 完整、单独审计 JD 明确写出的 preferred、priority、bonus、plus、优先或加分项；有证据时在首屏或靠前经历突出，没证据时保留真实 gap，不得冒充。
- 保持固定开头：个人简介/Summary → 教育背景/Education → 专业能力/Professional Skills；随后独立显示实习/工作经历，再进入项目经历。项目经历可以并应当根据岗位画像、JD 关键词、项目的真实方法与领域关系以及已选 CV 母版拆成多个 section，每个 section 使用招聘官容易理解且贴合岗位的名称，不强制合并为统一项目 section。
- 必须以本次选定的 cv_base.tex 完整源码为实际生成起点，保留其 TeX 框架、字体、字号、页边距、行距、联系方式、教育格式、宏命令、项目排版、标题层级和视觉体系；母版中的项目组织、展开深度和同语种表达是改写基线，不能另起空白简历或只提取其中少量事实。对于母版里已有且事实仍准确的内容，尽量直接复用自然、成熟的术语、句式、详细程度和论证顺序，只做当前岗位真正需要的调整。
- 每个入选项目必须完整写两条详细、信息密度充足的 bullet，不得压缩成只有动作和工具名的短句。第一条完整展开问题或对象、本人贡献、方法、技术实现和产物；第二条完整展开验证、结果或量化结果、novelty 和用途。项目标题、问题切入、事实取舍、动作、方法、验证与结果的整体表述都必须围绕目标岗位画像，使两条合起来自然体现共享工作功能、方法价值和岗位贡献；不得只在第二条末尾机械添加迁移性结论。事实不足以支撑两条的项目不入选，改选证据链完整的相关项目。
- CV 至少保留三篇经事实母版核验的论文或手稿，优先选择最能支持岗位画像和本人作者贡献的论文；不得因为岗位偏行业或版面调整减到三篇以下，论文状态不得夸大。
- 先冻结事实和内容，再排版。PDF 必须恰好两页，第二页从可用正文区域顶部到最后一项可见正文底部的有效占用深度必须严格超过 75%。不足时优先扩展已入选项目中有事实支持的方法、技术实现、novelty、验证、结果和整体岗位相关性，或补回被错误省略的高相关论文与事实；不得用放大间距、空白、空话或弱相关项目凑页。
- 在同一次任务内自行完成事实、实体归属、岗位语言、10 秒扫描、PDF 技术和视觉检查；除输入缺失或权威事实冲突外，不请求中间确认。
- 把岗位画像、优先/加分项、取舍、三个潜在拒绝理由、事实与语言审计、关键词覆盖和版式结论写入 cv_review.md。`;

export type CvGenerationLanguage = "zh" | "en";

export const CHINESE_CV_GENERATION_RULES = `## 当前 CV 语言专项规则：中文

目标：写成中文母语招聘官能够快速理解的专业简历原稿，而不是英文简历的逐句翻译。必须同时做到自然、简洁、准确、专业和可核验。中文流畅度不得以弱化技术含量、删掉量化结果或改变事实边界为代价。

1. 句子结构
- 每条 bullet 只承载一个主要招聘信号，优先使用“本人行动或贡献 + 方法或对象 + 结果或影响”的自然动宾结构，把最重要的信息放在句首。
- 连续出现多个“的”、多层定语、名词堆叠、被动语态直译、悬空主语、过长并列成分，或必须在脑中还原英文才能理解的句子，必须拆分或重写。
- 不使用第一人称，不写完整叙事段落，不把背景介绍放在本人贡献之前。句子可以精炼，但不得省略到无法判断谁做了什么。

2. 动词与招聘语域
- 避免机械重复“负责”“参与”“协助”“通过”“基于”“针对”“进行了”等空泛起手式。根据事实改用开发、构建、设计、推导、验证、比较、识别、量化、交付、协调等准确动词，但不得为了动词更强而扩大本人贡献。
- 研究和方法内容使用自然严谨的中文学术表述，行业和应用内容使用简洁直接的招聘语言。不得把所有项目写成同一种腔调，也不得把学术研究虚构成已经上线的生产系统。
- 删除“具备较强能力”“熟悉相关工作”“取得良好效果”等没有证据的信息。用具体方法、对象、规模、结果或交付替代自我评价。

3. 中英文与术语
- 只在中文读者识别方法、软件、模型、论文题目、官方名称或 JD 关键词确有需要时保留英文。不要用英文短语串联本可自然表达的中文句子。
- 保留英文时遵守冻结展示规则和官方大小写；同一术语全篇使用同一种写法。不得擅自翻译官方名称，也不得删除 ATS 需要且事实支持的关键词。
- 中文标点、数字、空格、日期、地点和括注格式必须全篇一致。中文个人简介、教育背景、项目年月、地点、SQL、括注和脑区皮层术语严格服从冻结展示规则。

4. 三遍校读与通过标准
- 第一遍检查语法、主谓搭配、指代和句子是否完整。
- 第二遍检查术语、动词、搭配和行业表达是否像中文母语专业人士所写。
- 第三遍按招聘官速度通读节奏、信息密度、重复词和首屏可读性。
- 任一句像翻译稿、需要回读、存在两种理解，或不能立即识别本人贡献，均判定未通过并继续重写。`;

export const ENGLISH_CV_GENERATION_RULES = `## Current CV language rules: English

Objective: write an original, idiomatic U.S. English resume for an experienced recruiter, not a sentence-by-sentence translation from Chinese. The writing must be concise, specific, evidence-bounded, ATS-readable, and natural for the target industry. Fluency must never change technical meaning, ownership, publication status, dates, or measured results.

1. Sentence structure
- Write concise resume bullets without first-person pronouns. Each bullet should communicate one primary hiring signal and lead with the candidate's action or contribution.
- When the frozen facts support it, use this order: action or contribution + method, scope, or object + result or impact. Do not force a metric when none exists.
- Break up long sentences, stacked clauses, heavy nominalization, dangling modifiers, and literal Chinese syntax. A recruiter should understand the contribution in one pass.

2. Verbs and recruiter language
- Use strong but accurate verbs such as developed, designed, derived, built, evaluated, validated, quantified, identified, delivered, or coordinated only when the evidence supports that level of ownership.
- Avoid repetitive or vague openings such as responsible for, participated in, assisted with, worked on, helped, utilized, leveraged, successfully, various, and related tasks. Replace them with the verified action and object, without inflating contribution.
- Use past tense for completed work and present tense for ongoing work. Maintain parallel grammar within each section and consistent U.S. English spelling and punctuation.
- Do not describe academic prototypes as production deployments, collaboration as leadership, contribution as ownership, or submitted work as published.

3. Precision, terminology, and ATS language
- Preserve official names, method names, software, model names, paper titles, acronyms, and JD terms exactly when appropriate. Integrate supported keywords into natural sentences rather than keyword lists.
- Remove generic claims such as strong analytical skills, excellent communication, or proven impact unless the CV immediately provides concrete evidence.
- Keep every number, sample size, date, method, result, author role, contribution boundary, and publication status identical before and after editing. Use one consistent term for the same concept throughout the CV.

4. Three-pass edit and pass criteria
- Pass one checks grammar, articles, prepositions, tense, agreement, modifiers, and parallel structure.
- Pass two checks idiomatic recruiter language, verb strength, industry register, and whether the wording sounds originally written in English.
- Pass three checks concision, repetition, rhythm, first-page scanability, and information density.
- Any sentence that sounds translated, requires rereading, hides the candidate's contribution, or permits an inflated interpretation fails and must be rewritten.`;

export function cvLanguageGenerationRules(language: CvGenerationLanguage) {
  return language === "zh" ? CHINESE_CV_GENERATION_RULES : ENGLISH_CV_GENERATION_RULES;
}

export function normalizeCvGenerationRules(value: unknown) {
  const text = String(value ?? "").normalize("NFKC").trim();
  if (!text) return DEFAULT_CV_GENERATION_RULES;
  if (text.length > CV_GENERATION_RULES_MAX_LENGTH) {
    throw new Error("CV_GENERATION_RULES_TOO_LONG");
  }
  return text;
}
