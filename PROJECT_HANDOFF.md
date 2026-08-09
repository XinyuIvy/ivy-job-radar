# Job Application / CV Knowledge Base 项目交接

最后更新：2026-08-09（America/New_York）

> 本文件用于新 Chat 接手。开始工作前必须重新读取两个仓库的当前 `main`、近期 commits、现有 handoff、manifest 和未提交变更。GitHub 当前文件与历史提交是事实依据；旧聊天只用于解释决策背景。不要与另一个 Chat 同时修改同一仓库。

## 1. 当前结论先看这里

当前项目不是单纯的 CV 修改，也不是单纯的招聘网站，而是三层系统：

1. `XinyuIvy/CV`：原始证据、结构化事实、capability ontology、行业翻译、检索索引和中英文行业 CV 母版。
2. `XinyuIvy/ivy-job-radar`：岗位与完整 JD、申请状态、CV Tailor 界面，以及当前 Hybrid RAG 的运行实现。
3. 未来私有 `job-application-archive`：每个 `application_id` 对应的完整申请包；尚未创建。

截至 2026-08-09：

- Stage 1 原始证据完整性审计已完成。
- `15` 个 major projects 全部 `Ready for bounded Stage 2`。
- `CV` 仓库里已经存在一版 Stage 2–7 内容、编译索引和 Stage 7 匹配规范。这些内容早于最终 Stage 1 修订完成，因此不能从头删除重做，也不能不检查就直接视为最终真相；下一步应依据最终 Stage 1 manifest 做增量一致性审计和必要修订。
- 旧 RAG 代码、索引、source metadata 和测试均需保留为 `prototype / baseline`。
- 当前运行 RAG 的代码在 `ivy-job-radar/app/lib/hybrid-rag.ts`；`CV` 仓库主要保存结构化事实与索引，不要混淆两者。
- 当前 RAG 使用的所谓 embedding 不是 OpenAI、BGE、E5、Sentence Transformers 或其他预训练语义模型，而是本地 `384` 维 subword feature hashing。它能提供一个 deterministic dense channel，但不具备真正的深层语义理解。这是当前效果不佳的关键原因之一。
- 当前问题不是简单地“embedding 换得不够好”，而是语料权威性、JD 拆分、局部检索、匹配分类和全局 CV 决策曾被混在一起。RAG 应负责找证据，不应独立裁决 Direct / Transferable / Adjacent，更不应独立决定整份 CV。

当前远端审计锚点：

- `XinyuIvy/CV` main：`22b2071c91e149fc2c763f0f49c8cf9be6101912`，commit message `Align Stage 1 manifest with 15 primary projects`。
- `XinyuIvy/ivy-job-radar` main：`8d1768eff0d1b64fbf58ada0b175d2fd53d9b7f9`，commit message `Respect NeuroStat status and complete CV Tailor regression coverage`。

这些 SHA 只是本次交接锚点。新 Chat 必须重新读取最新 main，不要假设它们永远是最新状态。

## 2. 用户最终目标与不能违反的边界

目标是建立可用于 `Hybrid RAG + capability ontology + industry translation` 的求职事实知识库，使新 JD 进入后能够准确识别：

- 用户真正做过的统计方法、计算方法和工具；
- 实际解决过的研究或业务问题；
- 方法背后的统计与分析概念；
- 在 Pharma、Tech / Data Science / ML、Quant Finance、Healthcare / Life Sciences Consulting 中可安全使用的能力表达；
- Direct、Strong Transferable、Adjacent、No Evidence 的边界。

硬约束：

- Transferable capability 不能写成真实行业经验。
- Adjacent experience 不能写成 direct experience。
- proposal 中计划做的内容不能写成已经完成。
- project-level method 不能自动变成用户个人贡献。
- 旧 `FACT_MASTER`、旧 CV bullet 和聊天总结不能创造新事实。
- embedding similarity、BM25 分数、token overlap 或 graph distance 都不能单独决定事实等级。
- 模型开发、生产部署、监管申报、客户交付、因果、交易、alpha、回测、LLM/RL 等范围必须有直接证据，不能通过相似词推断。
- 当前不重新生成 embeddings；先保留现有实现作为 baseline。

## 3. 两个仓库的职责

### 3.1 `XinyuIvy/CV`

主要路径：`master/project-evidence/`

核心文件：

- `STAGE1_COMPLETION_MANIFEST.yaml`：15 个项目的权威来源、缺失、版本、来源边界和 Stage 2 readiness。
- `STAGE1_RAG_BASELINE.yaml`：旧 RAG / index 基线清单。
- `STAGE2_EVIDENCE_MAP.yaml`：项目身份、角色、权威来源和项目级事实。
- `STAGE3_ATOMIC_FACTS.yaml` 与 collaborative addendum：atomic facts、状态、个人归属和证据位置。
- `STAGE4_CAPABILITY_LAYERS.yaml` 与 addendum：exact methods/tools、statistical concepts、problem solved、transferable capabilities。
- `STAGE5_INDUSTRY_TRANSLATIONS.yaml` 与 addendum：四行业翻译和 invalid-overclaim guardrails。
- `STAGE6_CONCEPT_GRAPH.yaml` 与 addendum：typed concept graph。
- `STAGE7_HYBRID_RAG_MATCHING.yaml` 及 non-project / literature addenda：JD requirement、检索、rerank、验证和推荐规则。
- `FACT_INDEX_BUILD_SPEC.yaml`：从 Stage 3–6 确定性生成检索记录的 join 规范。
- `CONTENT_FREEZE_MANIFEST.yaml`：Stage 1–7 内容准备状态。
- `scripts/build_fact_index.py`：索引编译器。

当前生成索引的规模（本次可见版本）：

- `FACT_INDEX.jsonl`：196 行；统一 project / non-project records。
- `PROJECT_INDEX.jsonl`：15 行。
- `CONCEPT_EDGES.jsonl`：135 行。
- `CREDENTIAL_INDEX.jsonl`：3 行。
- `COURSEWORK_INDEX.jsonl`：26 行。
- `PROFILE_INDEX.jsonl`：20 行。
- `LITERATURE_INDEX.jsonl`：10 行。

这些 JSONL 是 build artifacts，不是独立真相源。若内容修订，必须从 source YAML 重新确定性编译，不能手工同时维护多份事实。

### 3.2 `XinyuIvy/ivy-job-radar`

部署信息：

- Live Site：`https://ivy-job-radar.rourou1199.chatgpt.site`
- Site slug：`ivy-job-radar`
- GitHub main 合并后不会自动更新 Site；功能性 commit 仍需在 Sites 流程中显式同步。

与 CV/RAG 直接相关的运行文件：

- `app/lib/hybrid-rag.ts`：Hybrid retrieval、BM25、本地 hashing embedding、concept graph、reranking、classification。
- `app/api/cv-tailor/analyze/route.ts`：读取 private CV repo，执行完整 JD 分析，合并 project 与 structured evidence，独立判断模板覆盖。
- `app/lib/structured-evidence.ts`：学历、课程、技能、论文、服务、教学、奖项和 literature records 的确定性匹配。
- `app/lib/cv-template-index.ts`：当前 CV 模板的独立 snippet index。
- `app/lib/cv-capability-ontology.ts` 与 `cv-jd-extra-rules.ts`：双语 requirement rules、capability relations 和 exclusions。
- `tests/hybrid-rag.test.mjs`、`tests/structured-evidence.test.mjs`、`tests/cv-tailor-alibaba.test.mjs`、`tests/test_cv_atomic_rag_and_diff.py` 等：回归测试。

## 4. Stage 1 原始证据审计结果

最终 `primary/` 与 15 个 major projects 一一对应：

1. `multimodal_multiregion_distance`
2. `semiparametric_confidence_sets`
3. `resi_asymptotic_inference`
4. `model_reliance_confidence_sets`
5. `neurostat_virtual_lab`
6. `hospital_readmission_risk`
7. `nph_treatment_effects`
8. `pfizer_asthma_clinical_trial_simulation`
9. `ivy_job_radar`
10. `ai_usage_dashboard`
11. `markov_switching_matrix_autoregressive`
12. `lumbosacral_resting_state_fc`
13. `lumbosacral_mffe`
14. `anxiety_trajectories`
15. `correlation_accuracy_mapa`

关键修订：

- 用户明确确认两个 lumbosacral 项目中主要负责全部统计分析和 manuscript statistical sections review；该 attribution 必须继续标为 user-confirmed，而不是 manuscript-proven。
- `NPH_paper_for_SMMR__Accepted.pdf` 就是 Yale MS thesis 的 accepted-paper form，不缺另一份独立 thesis。
- anxiety trajectories 和 MAPA/correlation accuracy 使用公开权威 paper/preprint 补入。
- Ivy Job Radar、AI Usage Dashboard、NeuroStat 使用外部仓库 commit anchor 和 archive representation。
- 原来的 standalone Shiny 3D visualization 不再作为第 16 个 major project；它是 semiparametric confidence-set 项目的 supporting software evidence。
- 旧 proposal PDF 是 legacy；NeuroStat authoritative proposal 使用更新后的 `Proposal_IS` commit anchor。
- 每个项目可能仍缺 code、later revision 或 reviewer response，但已足够开始 bounded fact extraction；Ready 不等于所有材料完美齐全。

## 5. RAG 是如何一步步搭起来的

下面按技术演进顺序记录。可把它视为 `legacy + 9 次主要迭代`，其中有些 commit 是修复同一代架构，而不是完全新的系统。

### 5.1 Legacy：没有真正 RAG，只有 `FACT_MASTER + alias overlap`

最早的 CV Tailor 流程：

```text
完整 JD
-> predefined requirement / alias detection
-> 读取 private CV repo 的整个 FACT_MASTER.md
-> 读取行业 CV template
-> FACT_MASTER 按 project section 切开
-> literal alias / keyword overlap
-> 找匹配 fact lines
-> covered / supported_gap / unsupported_gap
```

实现特征：

- `hasAlias()` 主要做标准化后的 substring matching。
- 每个 requirement 有手写 `aliases` 和 `projectTerms`。
- 在项目段落中按命中 term 数量排序，最多返回少量行。
- 模板中出现 alias 就容易被视为 covered。
- 没有 embedding、向量数据库、BM25、concept graph 或真正 reranking。

问题：同一概念的跨行业表达无法稳定召回；相同词在不同范围下又容易误判。例如 `model reliance confidence sets` 与 Tech 的 `uncertainty-aware feature importance`、Quant 的 `signal robustness` 并非 literal synonyms。

### 5.2 第一次基础设施：structured knowledge contract，但仍是词重叠

主要 commit：

- `4e55da0...` / PR #53：Add CV knowledge base infrastructure。

当时约定从 private CV repo 读取：

```text
knowledge/FACT_INDEX.json
knowledge/CAPABILITY_ONTOLOGY.json
knowledge/INDUSTRY_TRANSLATION_MAP.json
```

并新建 Knowledge Base UI、private repo reader 和 retrieval test surface。

当时 `retrieveKnowledgeFacts()` 的做法仍是加权词重叠：

- exact method：权重 5
- statistical concept：4
- problem solved：4
- transferable capability：3
- domain：2
- industry translation：3
- verified fact：1
- high evidence 总分乘 `1.12`
- low evidence 乘 `0.75`
- 最终取 top 15

这不是 vector semantic RAG。它只是为未来 RAG 搭了 schema、UI 和读取接口。

### 5.3 LaTeX 母版与中文解析修复

主要 commits：

- `f16a293...`：直接读取 TeX CV templates。
- `d3a71a6...`：修复中文 LaTeX CV analysis 与 project parsing。

改进：

- 不再把旧 Markdown/错误模板当成当前提交母版。
- 扩充中英文 aliases。
- 修复中文项目标题和 LaTeX block 识别。

局限：仍然依赖 alias 表，扩 alias 只能修补已知样例，不能解决真正语义泛化。

### 5.4 Evidence-grounded multilingual：从 FACT_MASTER 转向 Stage 3 atomic facts

主要 commit：

- `c1ee599...`：Add evidence-grounded multilingual CV analysis。

改进：

- 读取 `STAGE3_ATOMIC_FACTS.yaml`。
- 事实带 `fact_id`、`fact_status`、`personal_attribution`、`evidence_strength`、`source`、`evidence_location`、`claim_boundary`。
- 初步区分 Direct / Strong Transferable / Adjacent。
- 仍用 `FACT_MASTER` 只做中文本地化或定位，不再让它成为事实权威。

局限：classification 仍主要由 alias/projectTerms 命中触发；相似度与事实等级没有真正解耦。

### 5.5 第一版真正 Hybrid RAG

主要 commits：

- `f8db76a...`（CV）：编译 canonical FACT_INDEX / CONCEPT_EDGES / PROJECT_INDEX。
- `22ab0c1...`（Job Radar）：Implement verified Hybrid RAG for CV customization。

新增的检索通道：

1. exact method / direct evidence overlap
2. BM25
3. 本地 dense hashing embedding
4. concept graph expansion
5. industry translation overlap

同时加入 preverification weighted score、fact status、ownership、evidence strength、scope conflict、overclaim guardrails 和 CV recommendation。

这是第一次可以称为 Hybrid RAG 的运行实现，但 dense channel 不是预训练 semantic embedding。

### 5.6 中文项目 identity 修复

主要 commit：

- `f6069df...`：Fix Chinese CV template project identity detection。

原因：项目名称在中英文、简称和 LaTeX 标题中不同，导致“事实找到了，但系统判断当前母版没有这个项目”或反向误判。此轮主要修 template entity resolution。

### 5.7 Structured profile evidence：学历、课程、技能和论文不再走项目迁移逻辑

主要 commits：

- CV 侧 `a84a87f...` 到 `90c81ba...`：加入学历、课程、skills、publications、service、teaching、awards、literature indexes，并编译完整 indexes。
- Job Radar `1c16c07...`：Use structured profile evidence in CV Hybrid RAG。

改进：

- Biostatistics / Statistics 学历先走 structured credential direct matching。
- coursework 只能是 `Coursework Match`，不能升级为 professional implementation。
- published publication 与 under-review manuscript 分开。
- literature review 不自动等于 meta-analysis。
- Python 等 demonstrated skill 可由 profile/project evidence 直接支持。
- RAG fact retrieval 与 structured eligibility evidence 合并，但保留不同 classification。

### 5.8 所有 gap 显式处理

主要 commit：

- `c6e2aa8...`：Handle every CV evidence gap explicitly。

改进：

- `supported_gap` 和 `adjacent_gap` 都出现在逐条处理范围。
- Adjacent 只生成 `no_direct_edit`，不生成伪造 bullet。
- 不再只处理前 10 条 gap。

### 5.9 双语 ontology + 双语料分离 + JD 原子化

主要 commit：

- `aa4c030...`：Fix CV Tailor dual-corpus semantic matching。

这是很重要的一轮：

- 把“事实是否支持”与“当前模板是否已经表达”拆成两个独立 corpus。
- `FACT_INDEX` 回答用户有没有证据。
- `cv-template-index.ts` 回答当前 CV 是否已经覆盖。
- 每个 template snippet 带 section、entityId、raw LaTeX、visible text、concept IDs、fact IDs 和 relation path。
- 加入双语 capability ontology 和关系：`exact_equivalent`、`narrower_than`、`evidence_for`、`transferable_to`、`related_only`、`excluded`。
- 把 Alibaba Auto Research JD 的复合要求拆成 RL、PPO、DPO、GRPO、reward design、training stability、tool calling、code execution、data cleaning 等原子 requirement。
- 加入 RL / LLM / publication guardrails。

此轮修复了“CV 有相关内容却显示未覆盖”和“事实库有相关词就显示 direct”的部分问题，但 rule/alias 依赖仍然很重。

### 5.10 中文教育列表、状态与命名方法硬约束

主要 commits：

- `553dbd1...`：Tighten Chinese education list matching。
- `8d1768e...`：Respect NeuroStat status and complete CV Tailor regression coverage。

改进：

- `数学、统计、自动化及相关 STEM` 这类列表上下文不再靠宽泛单字触发。
- 完整 Alibaba fixture 原子要求数超过 45；route 通过每 30 条 rule 分块调用 `runHybridRag()`、合并去重，绕过单次 `.slice(0, 45)` 上限。
- PPO、DPO、GRPO、RL、RL post-training、reward design、training stability、exploration efficiency 和 PyTorch 被标为 named methods/tools，必须有 exact method evidence；否则 `No Evidence`。
- NeuroStat 的 planned / in-progress / implemented 状态不再被错误写成完成经验。
- CI 纳入完整 RAG regressions。

## 6. 当前 Hybrid RAG 的精确技术实现

### 6.1 文本标准化与 tokenization

- Unicode `NFKC` normalization。
- lower-case；把 dash、underscore、slash 变为空格。
- English 使用 regex token，并移除小型 stop-word set。
- 只有非常简单的 stemming：`collaborat*`、`-ing`、`-ed`、复数 `-s`。
- Chinese 连续汉字块被转为 overlapping character bigrams；单字块保留。

集合相似度不是 Jaccard，而是：

```text
overlap_count / sqrt(|left| * |right|)
```

它类似二元 token vector 的 cosine overlap。

### 6.2 Dense channel：`local_subword_hash_v1`

当前 embedding 参数：

- 维度：`384`
- 特征：上述 tokens + 标准化文本的 overlapping character trigrams
- hash：FNV-1a 32-bit
- bucket：`hash % 384`
- 符号：根据 hash 最低位做 `+1 / -1`
- 最后做 L2 normalization
- 两向量点积作为 cosine；负值截为 0

公式化表示：

```text
v[h(f) mod 384] += sign(h(f))
v <- v / ||v||2
similarity(q, d) = max(0, q^T d)
```

这个实现的优点：

- deterministic
- 无 API key
- Cloudflare Workers 可运行
- 速度快、部署简单

缺点：

- 它是 feature hashing，不是训练过的 semantic embedding。
- 不理解句义、否定、ownership、完成状态或行业范围。
- 语义不同但字符/词片段相近时可能高分。
- 同义但词面不同的短句仍可能低分。
- 384 bucket 会有 hash collisions。

面试时应诚实表述为：

> Implemented a deterministic 384-dimensional signed subword-hashing retrieval channel for a serverless prototype; it was not a pretrained neural embedding model.

不要说使用了 OpenAI embeddings、Sentence-BERT、BGE 或 E5；仓库没有证据。

### 6.3 Sparse channel：BM25

参数：

- `k1 = 1.5`
- `b = 0.75`

document 是每条 fact 的 `retrieval_text`；query 是 `requirement.sourceText + normalizedConcepts`。

IDF：

```text
log(1 + (N - df + 0.5) / (df + 0.5))
```

BM25 适合 exact terminology 和 rare methods，但不能证明事实类别。

### 6.4 JD requirement extraction

当前 extraction 不是 LLM parser，而是：

- 按换行、句号、分号等切 unit。
- 对 `and/or/以及/并且/同时/及` 和逗号列表进一步切分 evidence unit。
- 用手写双语 `RequirementRule.aliases` 检测 requirement。
- 再从 facts 的 exact methods 和 graph nodes 构建 dynamic vocabulary。
- hard requirement 用 `must/required/要求/必须` 等 regex 判断。
- production / regulatory / causal / client-facing scope 单独标记。
- route 将 rules 每 `30` 条分块运行、合并去重。

问题：切分能提高 atomicity，但可能破坏完整语义和否定/条件关系。它也不是开放式 requirement extraction，规则表外概念仍可能漏掉。

### 6.5 Concept graph

- 默认最多 2 hops。
- path score 是 edge `retrieval_weight` 的连乘。
- `adjacent_concept` 路径标记 `adjacentPath=true`。
- `functional_equivalent` / `transferable_industry_interpretation` 标记 transferable path。
- 禁止从 adjacent path 再接 transferable edge 人为抬高强度。
- graph 可以扩大召回，不能提升 Stage 3 evidence strength、ownership 或 completion status。

### 6.6 候选 union 与 reranking

候选来源：

- exact/direct evidence overlap
- BM25 top 20 cutoff
- embedding top 20 cutoff
- graph path
- industry translation overlap

每个 requirement 最后按 preverification score 排序，取 top 8。

当前加权分数：

| Component | Weight |
|---|---:|
| exact method 或 direct evidence overlap | 24 |
| statistical concept similarity | 16 |
| problem-solved similarity | 22 |
| industry functional similarity | 12 |
| evidence strength | 10 |
| personal attribution | 10 |
| status readiness | 6 |

### 6.7 Classification 与 guardrails

主要阈值：

- Direct：`cv_eligible` 且 direct overlap `>= 0.78`，并且没有 scope conflict / overclaim flag。
- Strong Transferable：preverification `>= 42`，且 problem similarity `>= 0.34`、industry similarity `>= 0.42` 或有 transferable graph path。
- Adjacent：preverification `>= 16`、存在 graph/BM25，或 embedding `> 0.12`。
- embedding-only 不能成为 Direct 或 Strong Transferable。
- named method/tool exact overlap `< 0.78` 时强制 No Evidence。
- `project_context` 强制 No Evidence。
- planned / in-progress 可以保留 match strength，但 CV recommendation 只能 conditional，并必须保留状态措辞；route 另对 planned evidence 做 Adjacent ceiling。
- `cv_eligible=false` 强制 No Evidence。

## 7. 测试与评估做过什么

已有 regression tests 主要验证规则安全性和已知案例：

- exact Monte Carlo 可以 Direct。
- mixed-effects 经 adjacent graph 不能变 Bayesian experience。
- project-level-only 不能成为个人 bullet。
- production scope 不能从 research prototype 推断。
- planned / in-progress 与 match strength、CV wording 分开。
- Biostatistics 学历对 Statistics requirement 是 structured credential direct。
- coursework 不成为 implementation experience。
- published journal article 可支持 peer-reviewed publication；under-review 不行。
- literature review 不等于 meta-analysis。
- Alibaba JD 能拆出 45 条以上原子要求。
- PyTorch、RL、PPO、DPO、GRPO 等在无 exact evidence 时保持 No Evidence；Python 为 Direct。
- template corpus 与 fact corpus 独立。

重要限制：

- 这些是 hand-crafted regression tests，不是大规模人工标注 benchmark。
- 仓库没有 committed dedicated query log。
- CV 仓库没有 committed embedding artifact。
- Stage 1 audit 没有找到 standalone test-result artifact；不能从测试文件存在推断历史 CI 全部通过。
- 当前测试更擅长防止已知 overclaim，不足以证明跨行业召回、排序和全局 CV 选择质量。

## 8. 为什么最后效果仍然不好

### 8.1 任务定义错位

旧系统把“文本看起来相关”当成“用户直接做过”。检索是 candidate generation，事实等级是 evidence adjudication，两者不能合并成一个 similarity threshold。

### 8.2 Dense channel 不是真语义 embedding

`local_subword_hash_v1` 只编码 token 与 char-trigram overlap。即使叫 embedding，它也不理解：

- 已完成 vs 计划完成
- 用户负责 vs 合作者负责
- 学术方法 vs 生产经验
- 统计相似性 vs 行业经历
- 否定、条件、范围和组合要求

### 8.3 语料在最初并未完成权威来源审计

早期检索依赖 FACT_MASTER、旧 bullet、proposal 和版本混合材料。即使检索准确，也可能准确找到非权威、计划中或过时文本。最终 Stage 1 已解决 source readiness，但运行索引必须再与最终 manifest 对齐验证。

### 8.4 JD 拆分过碎或规则表过重

原子化能避免把 PPO/DPO/GRPO 混成“AI experience”，但按标点和连接词切得太碎会丢失完整谓词、否定、修饰范围和 responsibility context。手写 aliases 对已知 Alibaba JD 很有效，对新 JD 泛化有限。

### 8.5 局部 top-k 不能完成整份 CV 决策

每个 requirement 最多看 8 个 candidates，无法自动处理：

- 两页 CV 的项目取舍
- 多个 requirement 由同一项目共同覆盖
- 当前模板已经写了什么
- 项目组合的重复与互补
- 目标行业整体叙事
- 教育、技能、论文和项目之间的全局权衡

### 8.6 手工分数与阈值未经标注数据校准

24/16/22/12/10/10/6、0.78、42、16、0.34、0.42、0.12 等来自设计规则和 regression tuning，不是由人工标注 train/dev set 学得或系统校准。分数看似精确，但不等于概率。

### 8.7 concept graph 仍可能产生合理但不真实的联系

graph 能解释方法功能相近，却不能创造 ownership、completion、domain 或 scope。若最终模型把 graph path 当事实，仍会发生 overclaim。

### 8.8 事实检索与最终判断的模型分工不合理

理想流程应是 5.6 Sol 完整读取 JD、当前行业 CV 和全部结构化事实卡，负责全局选择与语义裁决；RAG 只在数字、方法、职责、状态或新表述需要核实时回查原始 paper、supplement、code、proposal。当前网站 RAG 仍承担了过多 classification 和 recommendation 工作。

## 9. 现有 RAG 什么要保留，什么要冻结

保留：

- `app/lib/hybrid-rag.ts` 与 API interface。
- BM25、hashing dense channel、concept graph、structured evidence、template index。
- source metadata、fact IDs、graph paths、claim boundaries。
- existing indexes 与 deterministic compiler。
- regression tests 和历史 commits。
- 当前结果作为 baseline，用于后续比较。

冻结或降级：

- 不使用旧检索分数证明 Direct / Transferable / Adjacent。
- 不把 `local_subword_hash_v1` 描述成 pretrained semantic model。
- 不重新生成 embeddings，直到权威语料与 evaluation set 确定。
- 不从旧 CV bullet 反推事实。
- 不让 RAG 自动生成越过 fact boundary 的最终 bullet。

## 10. 后续可改善方案

建议分层改，不是直接把 384 维换成更大维度：

### 10.1 先完成最终 Stage 1 → Stage 2–7 一致性审计

- 以最新 `STAGE1_COMPLETION_MANIFEST.yaml` 为唯一 source admission boundary。
- 检查现有 15 项 Stage 2 project records 是否一一对应最终 authoritative sources。
- 检查所有 Stage 3 facts 的 source path、status、ownership、evidence strength、allowed claim 和 prohibited extrapolation。
- 检查 Stage 4–6 是否有由旧 FACT_MASTER/旧 source 演绎出的过强 capability。
- 修订后重新运行 deterministic index compiler。

### 10.2 建立人工标注 benchmark

至少收集来自四行业的真实 JD，并标注：

- atomic requirement
- relevant fact IDs
- expected retrieval set
- Direct / Strong Transferable / Adjacent / No Evidence
- hard scope conflict
- prohibited wording
- expected project selection

指标至少包括：Recall@k、MRR/nDCG、classification precision/recall、Direct false-positive rate、overclaim rate、evidence citation accuracy 和 project-selection agreement。

### 10.3 使用真正的 multilingual semantic embedding

在 benchmark 上比较适合中英文和长短语的预训练 embedding；具体模型必须在实施时根据当前可用服务、成本、隐私和部署环境选定，不能在本 handoff 中伪称已经使用。可比较：

- 本地/开源 multilingual retrieval model
- hosted embedding API
- bi-encoder retrieval + cross-encoder reranker

保留 BM25 和 exact channel，使用 reciprocal rank fusion 或经过标注校准的融合，而不是完全替换 sparse retrieval。

### 10.4 改成 field-aware multi-vector indexing

不要把整条 fact 压成单个 `retrieval_text`。分别索引：

- verified fact
- exact methods/tools
- problem solved
- statistical concepts
- ownership/status
- industry translation
- guardrails

召回可以合并；ownership、status、guardrail 只能做验证和限制，不能作为正向语义扩展。

### 10.5 LLM-assisted requirement extraction，但必须结构化验证

让模型从完整 JD 生成 requirement objects，保留 source span、谓词、对象、scope、must/preferred、experience level 和 negation；再用 deterministic rules 校验 named tools 和 hard requirements。不能让 LLM 无引用地补 requirement。

### 10.6 多轮 evidence retrieval

第一次召回后，模型可以针对缺失条件提出精确查询：

- 数字的比较对象是什么？
- 该方法是用户完成还是 project context？
- proposal 是否已经实现？
- 这个 result 在 paper、supplement 还是 code 中？

RAG 返回文件、版本、段落/代码位置和 source tier，模型再裁决。

### 10.7 把最终 CV 选择交给全局模型

每次定制 CV 时：

```text
完整 JD
-> 当前行业 CV 全文
-> 全量 model_context / fact cards
-> 全局项目选择与 coverage analysis
-> 对模糊点按需调用 evidence RAG
-> bullet-fact mapping + overclaim audit
-> 生成 CV、change log、evidence manifest、interview brief
```

## 11. Application ID 与申请归档的既定方案

尚未实现，但已确定架构：

- 每个申请有唯一 `application_id`，例如 `APP-2026-ALI-001`。
- ID 本身只是主键，不携带岗位内容。
- Ivy Job Radar 必须把完整 JD 和 lookup record 写入未来的 private `XinyuIvy/job-application-archive`。
- ChatGPT 收到 ID 后按固定路径读取 `application_record.yaml` 和 `jd_snapshot.md`；找不到必须停止，不能猜。

建议目录：

```text
applications/2026/APP-2026-ALI-001/
├── application_record.yaml
├── jd_snapshot.md
├── match_analysis.md
├── evidence_manifest.json
├── cv_customized.md
├── cv_customized.tex
├── cv_submitted.pdf
├── cv_changes.md
└── interview_brief.md
```

模型读取入口：

| 内容 | 位置 |
|---|---|
| 岗位、完整 JD、状态 | future private application archive |
| CV 母版、事实卡、ontology | `XinyuIvy/CV` |
| paper、supplement、code、proposal | authoritative evidence archive / source repos，按需 RAG |

当前不要先批量创建申请包。必须先把知识库和单个端到端测试跑通。

## 12. 下一 Chat 应该做什么

第一优先级不是立刻换 embedding，也不是修改 Ivy Job Radar UI。

### Step 1：恢复真实仓库状态

1. 读取 `XinyuIvy/CV` 最新 main、branches、recent commits、`STAGE1_COMPLETION_MANIFEST.yaml`、`STAGE1_RAG_BASELINE.yaml`、`CONTENT_FREEZE_MANIFEST.yaml`、Stage 2–7 files、build scripts 和未提交变更。
2. 读取 `XinyuIvy/ivy-job-radar` 最新 main、`PROJECT_HANDOFF.md`、RAG code/tests 和未提交变更。
3. 确认没有另一个 Chat 同时修改。

### Step 2：对现有 Stage 2–7 做 bounded reconciliation

不要从头重写，也不要假设全部有效。以最终 15-project Stage 1 manifest 为准：

- 做 project coverage audit。
- 做 source traceability audit。
- 做 status / ownership audit。
- 做 cross-card consistency audit。
- 做 prohibited-overclaim audit。
- 修复不一致后重新编译 JSONL indexes。

### Step 3：建立 RAG evaluation dataset

在修改 embedding 前保存旧系统输出作为 baseline，并建立人工标注 JD/requirement/fact gold set。没有 benchmark 就无法判断下一轮是真提升还是只对一个 JD 过拟合。

### Step 4：再设计 RAG v2

RAG v2 应优先解决真正 semantic embedding、field-aware indexing、fusion/reranking、multi-round source lookup 和 LLM/global adjudication 边界。保持旧实现可复现，不在原处静默覆盖。

## 13. Ivy Job Radar 已完成的非 RAG 工作

为了新 Chat 不重复修旧问题，以下已完成：

- 取消工资自动排除。
- hard requirement mismatch 不进入 negative preference learning。
- navigation/filter/search/scroll persistence。
- `/api/jobs` 第一版 session cache。
- Chrome bookmark save 直接进入 `准备材料`，不走核验。
- 快速连续保存使用独立 popup。
- pending live insertion，BroadcastChannel + localStorage + server/focus/visibility reconciliation。
- 新岗位插入正式 pending list 第一位，不插入顶部 summary。
- pending summary count optimistic update + reconcile。
- 收藏后今日卡片即时消失；人工核验通过后不 full reload。
- CV Knowledge Base 页面、private repo reader 和 structured retrieval infrastructure。

当前 Job Radar UX 仍待完成：

- 所有 application status transitions 统一 shared-state optimistic workflow。
- pending → submitted → interview → offer / rejected / withdrawn 即时移动。
- delete / rollback / undo 一致处理。
- public repo Git history / old PR diff 的完整隐私审计。
- 避免继续用 DOM injection 叠 patch；长期应由 React shared state 驱动。
- Site 不会因为 GitHub merge 自动部署，功能 commit 仍需同步 Site。

岗位扫描与筛选的当前规则：

- 中国与美国扫描入口分开。
- 目标方向：Biostatistics / Statistics、Data Science / ML Scientist / Research Scientist、Applied AI / Healthcare AI / Medical Device、Quantitative Research、Healthcare / Life Sciences Consulting。
- 不以软件工程、前后端、算法工程和纯 GenAI / LLM / NLP 开发为目标；但不能因为 JD 单独出现 deep learning、RL、deployment 或 LLM 就机械排除，必须看岗位核心职责。
- 工资过滤已经完全取消；工资只能用于展示或核验。
- BOSS 等中国平台会受 `code: 37`、登录、风控和非公开页面限制；不能称为稳定 API 接入，也不能绕过验证码或平台安全限制。
- source unavailable、rate limit、真 0 条和岗位过期必须区分；不完整 source 不能触发 missing/expired reconciliation。
- 目前产品优先级是日常求职 workflow、CV evidence matching 和申请归档，不应在用户未明确要求时把全部时间重新投入招聘平台抓取。

当前 CV Tailor 仍主要是 analysis-oriented workflow：完整 JD requirement、事实支持、模板覆盖、gap 和项目推荐。自动改完整 CV、编译提交 PDF、创建申请包和回写归档尚未形成可靠端到端流程。

## 14. 操作与安全规则

- `XinyuIvy/CV` 是 private；Job Radar repo 当前 public。
- `CV_GITHUB_TOKEN` 只能通过环境变量读取，不得写入聊天、代码、README、PR 或日志。
- 不要把 private evidence archive 发布到 public repo。
- 不要声称测试通过，除非实际执行或看到对应 CI run。
- 不要因测试文件存在就推断 historical CI success。
- 不要修改 CV template，除非用户明确进入模板或具体 JD 定制阶段。
- 不要在本阶段创建新的 application archive repo，除非用户明确授权进入该步骤。
- 不要与其他 Chat 并行写同一仓库。

## 15. 给新 Chat 的推荐开场指令

```text
继续 Job Application / CV Knowledge Base 项目。先读取 XinyuIvy/ivy-job-radar 根目录 PROJECT_HANDOFF.md，并以 GitHub 当前 main 为准核对 XinyuIvy/CV 与 XinyuIvy/ivy-job-radar 的实际状态。

Stage 1 已完成，15 个 major projects 全部 Ready for bounded Stage 2；但 CV 仓库已经存在一版 Stage 2–7 与编译索引，因此不要从头重复或删除。请先以最终 STAGE1_COMPLETION_MANIFEST.yaml 为准，对现有 Stage 2–7 做 project coverage、source traceability、status/ownership、cross-card consistency 和 prohibited-overclaim 审计，修复不一致并重新确定性编译 indexes。

保留现有 Hybrid RAG 为 prototype/baseline，不重新生成 embeddings，不用旧检索分数决定 Direct/Transferable/Adjacent。完成内容一致性审计后，建立人工标注的 RAG evaluation dataset，保存 baseline 结果，再提出 RAG v2 实施方案。不要修改 CV 模板，不要针对具体 JD 生成 CV，不要创建申请归档仓库，除非我另行要求。
```
