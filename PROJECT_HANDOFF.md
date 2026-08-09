# Job Application / CV Knowledge Base 项目交接

最后更新：2026-08-09（America/New_York）

> 新 Chat 接手时必须重新读取 `XinyuIvy/CV` 与 `XinyuIvy/ivy-job-radar` 的最新 `main`、branches、recent commits、开放 PR、Actions、manifest/handoff 和可见并发状态。GitHub 当前状态优先于本文记录的 SHA。不要与另一个 Chat 同时写同一仓库。

## 1. 系统分工与当前状态

1. `XinyuIvy/CV`（private）：authoritative evidence、canonical cards、ontology、canonical deterministic retrieval artifacts、retrieval evaluation dataset/results、CV templates。
2. `XinyuIvy/ivy-job-radar`（public）：岗位/JD/申请状态、CV Tailor UI、当前仍在运行的 legacy Hybrid RAG prototype。
3. 未来私有 `XinyuIvy/job-application-archive`：每次申请的完整归档包；尚未创建。

已完成：

- Stage 1 原始证据审计完成，15 个 major projects 全部 Ready for bounded Stage 2。
- Stage 2 canonical graph 完成并验证：15 Project Cards / 37 Atomic Fact Cards / 14 Capability Cards / 18 Ontology Concepts。
- canonical deterministic retrieval/index compilation 已进入 CV main：15 project / 37 fact / 14 capability / 18 concept / 84 unified retrieval / 118 relations。
- retrieval evaluation dataset + frozen legacy baseline 已完成并进入 CV main。
- legacy Stage 2–7、旧 JSONL indexes、旧 compiler 和 Job Radar current Hybrid RAG 全部保留为 `legacy / prototype / baseline`。
- 尚未重新生成 embeddings，尚未修改 scoring/fusion/reranking/classification，尚未切换 Job Radar consumer，尚未开始 RAG v2。

当前关键远端锚点（接手时仍需重新核验）：

- CV retrieval evaluation merge：`a4e376b4aa2b4704a76032a7a063f9fefddb505e`（PR #15）。
- Job Radar handoff-before-evaluation merge：`b857b472fb774d6df337a37072201f188dfc3824`。

## 2. Canonical retrieval 最终验收链

Canonical retrieval 的主要 CV PR/commit：

- PR #6 workflow bootstrap → `94649367908ab264f3743fbb99a09c615b2d9a76`
- PR #9 fork-safe workflow fix → `bcd641c5c94ccb4959f6b0891820411d9ce05e2b`
- PR #7 canonical retrieval implementation → `23d6ef58408cebc320483c3475282816c9c3ab19`
- PR #11 post-merge revalidation → `4591d6bae22ea998cf4409a5b21f0bbd3669ee7f`
- PR #12 main-push validation → `a8386e807cd7b0c440fd9002b0accf6995906c72`
- PR #13 verifiable main validation status → `cc65aeb445de39d5289bd547933f316eb166f205`

`cc65aeb...` 有 GitHub commit status `canonical-retrieval-main = success`。

Canonical counts：

```text
projects = 15
facts = 37
capabilities = 14
concepts = 18
unified retrieval records = 84
relations = 118
```

Post-merge validation 保持：source traceability 0 violations、cross-record consistency 0 violations、compiled drift 0 violations，deterministic rebuild 不改变 artifacts。

## 3. 当前唯一 canonical chain

Stage 1 authority：

- `STAGE1_COMPLETION_MANIFEST.yaml`

Stage 2 canonical card graph：

- `STAGE2_CANONICAL_MANIFEST.yaml`
- `STAGE2_SCHEMA.yaml`
- `STAGE2_PROJECT_CARDS.yaml`
- `STAGE2_FACT_CARDS.yaml`
- `STAGE2_CAPABILITY_CARDS.yaml`
- `STAGE2_ONTOLOGY.yaml`
- `STAGE2_COMPILED_MODEL_CONTEXT.yaml`
- `STAGE2_VALIDATION_REPORT.yaml`
- `scripts/validate_stage2_cards.py`

Canonical deterministic retrieval layer：

- `CANONICAL_RETRIEVAL_BUILD_SPEC.yaml`
- `CANONICAL_RETRIEVAL_DEPENDENCY_AUDIT.yaml`
- `scripts/build_canonical_retrieval.py`
- `scripts/validate_canonical_retrieval.py`
- `CANONICAL_PROJECT_INDEX.jsonl`
- `CANONICAL_FACT_INDEX.jsonl`
- `CANONICAL_CAPABILITY_INDEX.jsonl`
- `CANONICAL_CONCEPT_INDEX.jsonl`
- `CANONICAL_RELATION_INDEX.jsonl`
- `CANONICAL_RETRIEVAL_INDEX.jsonl`
- `CANONICAL_RETRIEVAL_BUILD_MANIFEST.yaml`
- `CANONICAL_RETRIEVAL_VALIDATION_REPORT.yaml`

每条 canonical record 保留 stable ID、project linkage、status、ownership、source refs、non-ranking evidence-strength labels、allowed expression、prohibited expansion、retrieval fields/text。`evidence_strength.ranking_semantics = none`。Guardrails 不会被揉进 positive retrieval text 后丢失结构。

Relation index = 118：37 `project_has_fact` + 49 `fact_supports_capability` + 22 `capability_maps_to_concept` + 10 `concept_has_parent`。

## 4. Retrieval evaluation dataset / frozen baseline（已完成）

### 4.1 设计与存放位置

Evaluation assets 全部保存在 private `XinyuIvy/CV/master/project-evidence/evaluation/`，避免把 private canonical evidence/gold 复制进 public Job Radar。

核心文件：

- `RETRIEVAL_EVAL_SCHEMA.yaml`
- `ANNOTATION_GUIDE.md`
- `EVALUATION_INPUT_AUDIT.yaml`
- `RETRIEVAL_EVAL_MANIFEST.yaml`
- `RETRIEVAL_EVAL_QUERIES.json`
- `LEGACY_BASELINE_FREEZE.yaml`
- `LEGACY_BASELINE_RESULTS.json`
- `LEGACY_BASELINE_REPORT.yaml`
- `HUMAN_REVIEW_QUEUE.yaml`
- `RETRIEVAL_EVAL_VALIDATION_REPORT.yaml`
- `scripts/run_legacy_retrieval_eval.mjs`
- `scripts/validate_retrieval_eval.py`

CV PR #14 bootstrap evaluation workflow → `fe31054bbb68262eaec01d0b497ad591cab053f7`。

CV PR #15 `Establish retrieval evaluation dataset and frozen legacy baseline` → merge `a4e376b4aa2b4704a76032a7a063f9fefddb505e`。

### 4.2 Dataset 规模

共 42 queries：

- English 37 / Chinese 5
- deterministic boundary labels 27
- human-review-required 15
- human-confirmed 0

Intent coverage：

- exact method/tool 10
- problem solved 4
- ownership/contribution 5
- capability/concept 4
- cross-industry transfer 6
- adjacent scope 5
- unsupported claim 5
- status/provenance boundary 3

覆盖 methods/tools、research/business problems、ownership、capability/ontology、transferable、adjacent、unsupported、overclaim traps、NeuroStat planned、MAPA preprint、user-confirmed provenance 和中英文 queries。

### 4.3 Gold annotation 规则

Gold 必须引用 canonical stable IDs：project/fact/capability/concept IDs。禁止从 `FACT_MASTER`、旧 CV bullets、legacy Stage 2–7、旧 retrieval ranking/score 反推 gold truth。

Schema 将以下概念分开：

- retrieval relevance
- factual support
- proposed relationship: Direct / Transferable / Adjacent / Unsupported
- human-review state
- prohibited-overclaim boundary
- hard negative

主观的 broad Direct / Transferable / Adjacent 不能自动宣称 human confirmed。当前 15 条全部在 `HUMAN_REVIEW_QUEUE.yaml`，`human_decision: null`、`reviewer: null`。

### 4.4 Frozen legacy runtime

Baseline 没有复制或重写 RAG。Evaluation CI checkout 固定：

`XinyuIvy/ivy-job-radar@b857b472fb774d6df337a37072201f188dfc3824`

并直接 import 原版 `app/lib/hybrid-rag.ts`。

Runner 使用与 current route 一致的 frozen project evidence input：

- `FACT_INDEX.jsonl`
- `FACT_INDEX_STATUS_ADDENDUM.jsonl`
- `CONCEPT_EDGES.jsonl`

Frozen runtime diagnostics：

- `local_subword_hash_v1`
- 384 dimensions
- signed token + character-trigram hashing
- BM25 `k1=1.5`, `b=0.75`
- existing concept graph
- existing candidate union/top-k
- existing heuristic scoring/classification/guardrails

没有重新生成 embedding，没有调任何 threshold/weight，没有修改 `runHybridRag()`，没有切 production consumer。

### 4.5 Baseline 实际结果

42-query frozen legacy baseline 的最终指标：

```text
requirement extraction failures = 1
Project Recall@1 = 0.647436
Project Recall@3 = 0.844017
Project Recall@8 = 0.920940
Project MRR = 0.839744
Project nDCG@8 = 0.838915

exact canonical-compatible fact-ID metric eligible cases = 33
exact fact-ID recall = 0.461616
canonical fact IDs absent from legacy index = 11

deterministic classification accuracy = 0.666667
Unsupported hard negatives = 8
Unsupported hard-negative No-Evidence accuracy = 0.25
must-not-be-Direct cases = 13
direct false positives = 3
direct false-positive rate = 0.230769
```

Retrieval-channel candidate counts：

- exact = 117
- BM25 = 266
- embedding = 328
- industry translation = 131
- concept graph = 29

Failure taxonomy：

- canonical fact ID unavailable in legacy index: 8 queries / 11 fact-ID references
- deterministic classification mismatch: 9
- deterministic Unsupported not classified No Evidence: 6
- Direct false positive: 3
- related-context promoted Direct: 3
- gold project missing top 8: 6
- requirement not extracted: 1

### 4.6 主要结论

旧系统的 **project-level candidate retrieval 相对不错**：Recall@8 约 92%，MRR 约 0.84。

但 **fact-level identity alignment 和 evidence adjudication 明显更弱**：exact fact-ID recall 约 46%，且 legacy/canonical ID drift 很明显；8 个 deterministic Unsupported hard negatives 只有 2 个被正确判成 `No Evidence`；13 个 must-not-be-Direct case 有 3 个被错误升级成 `Direct`。

因此当前数据支持之前的诊断：问题不是单纯“召回完全找不到相关项目”，而主要是：

1. legacy 与 canonical fact schema/ID 漂移；
2. requirement extraction 有漏项；
3. similarity/retrieval 与 evidence adjudication/classification 混得太紧；
4. hard-negative / overclaim boundary 控制不足。

这些 baseline metrics 只描述这个 authored 42-query evaluation set，**不是 production quality estimate**。

### 4.7 Repeatability

Baseline 至少两次普通 feature-branch CI 在完全相同的：

- 42 queries
- frozen Job Radar commit
- legacy FACT_INDEX / status addendum / concept edges

上重新运行。

重复运行得到完全相同指标，Actions 明确输出：

`Evaluation outputs already match the frozen baseline.`

且没有生成新的 output commit。因此 repeatability 已通过。

### 4.8 Review 中修正的问题

PR #15 的 Codex review 找到两条有效 P1，均只修 evaluation harness/metric，不修改 legacy runtime：

1. Node 22.13 直接 import `.ts` 需要 `--experimental-strip-types`；workflow 已修复，后续多次 CI success。
2. 初版 `hard_negative_no_evidence_accuracy` 错把 Adjacent human-review cases 也要求为 No Evidence；已修正为只统计 **deterministic Unsupported hard negatives**。Adjacent hard-negative 只进入 must-not-be-Direct safety metric。

## 5. 必须保留的 legacy/prototype baseline

以下不是 canonical evidence truth，但不能删除：

- legacy Stage 2–7 files/addenda
- `FACT_INDEX_BUILD_SPEC.yaml`
- `scripts/build_fact_index.py`
- `FACT_INDEX.jsonl`
- `FACT_INDEX_STATUS_ADDENDUM.jsonl`
- `PROJECT_INDEX.jsonl`
- `CONCEPT_EDGES.jsonl`
- `CREDENTIAL_INDEX.jsonl`
- `COURSEWORK_INDEX.jsonl`
- `PROFILE_INDEX.jsonl`
- `LITERATURE_INDEX.jsonl`

`STAGE1_RAG_BASELINE.yaml` 是 preservation inventory。

Job Radar runtime **仍消费 legacy indexes**。当前阶段没有 consumer switch。

## 6. 关键事实/ownership/status guardrails

- Transferable ≠ 真实行业经验；Adjacent ≠ Direct。
- planned/proposal ≠ completed。
- project-level method ≠ 个人贡献。
- FACT_MASTER、旧 CV bullets、legacy Stage 2–7、旧 retrieval rankings 不能创建 gold facts。
- retrieval score、embedding similarity、BM25、graph distance 不是事实真值。
- capability/ontology 是 abstraction，不是独立 evidence。

项目边界：

- NeuroStat `NVL-001/002` 为 planned/design-only；旧 `NSVL-007` 是 legacy，不在 37 canonical facts。
- Markov-switching Matrix AR canonical ownership = `collaborator_project_level_only`。
- 两个 lumbosacral：用户确认主要负责全部统计分析 + statistical-section review；必须标 user-confirmed，不能伪装 manuscript CRediT。
- MAPA：coauthor + preprint/project context；不能升级个人方法发明/lead analysis，也不能称 peer reviewed。
- Pfizer：direct admitted 为 negative-binomial recurrent-event/AER、Monte Carlo、sensitivity、composite-endpoint evaluation；不能写 joint longitudinal/copula/regulatory authority。
- Readmission：temporal validation ≠ prospective deployment / another-institution external validation。
- RESI：`up to about 50x faster` 必须保留 benchmark context。
- Model Reliance：model reliance ≠ causal importance；working manuscript ≠ published；research analysis ≠ production deployment。

## 7. Legacy Hybrid RAG 技术冻结说明

### Tokenization

- Unicode NFKC、lower-case、dash/underscore/slash → spaces
- small English stop-word set
- simple stemming：`collaborat*`, `-ing`, `-ed`, plural `-s`
- Chinese character bigrams
- set similarity = `overlap_count / sqrt(|left| * |right|)`

### Dense channel：`local_subword_hash_v1`

不是 pretrained embedding：384-d signed feature hashing，token + char trigrams，FNV-1a 32-bit，bucket `hash % 384`，hash low bit 决定 ±1，L2 normalize，cosine/dot product，negative clipped to 0。

安全面试表述：

> Implemented a deterministic 384-dimensional signed subword-hashing retrieval channel for a serverless prototype; it was not a pretrained neural embedding model.

不要说使用 OpenAI embeddings、Sentence-BERT、BGE、E5。

### BM25

`k1 = 1.5`, `b = 0.75`; IDF = `log(1 + (N - df + 0.5) / (df + 0.5))`。

### Historical preverification weights

| Component | Weight |
|---|---:|
| exact method / direct overlap | 24 |
| statistical concept similarity | 16 |
| problem-solved similarity | 22 |
| industry functional similarity | 12 |
| evidence strength | 10 |
| personal attribution | 10 |
| status readiness | 6 |

这些是 heuristic/regression tuning，不是人工 gold-set 校准概率。

## 8. 下一阶段入口

**本 handoff 更新后停止，不要自动开始 RAG v2。**

下一步首先是人工审阅 `HUMAN_REVIEW_QUEUE.yaml` 中 15 条主观标签。人工审阅完成前：

- 不把这些 proposed Direct/Transferable/Adjacent 当作 human-confirmed gold；
- 不用它们调参；
- 不根据当前 baseline 做“为了涨分”的 query rewrite。

人工审阅完成后，才可单独进入 evaluation-informed RAG v2 design。RAG v2 应至少针对已经量化的失败类别提出假设：requirement extraction、canonical fact alignment、field-aware retrieval、真正 semantic embedding、fusion/reranking、evidence adjudication 与 overclaim guardrails；任何改动都要与 frozen baseline 比较。

仍不要把 canonical indexes 接入 production consumer，除非另开 consumer-integration 阶段并单独验证 source-schema migration。

## 9. Future application archive contract

Durable specification：[`docs/APPLICATION_ARCHIVE_CONTRACT.md`](docs/APPLICATION_ARCHIVE_CONTRACT.md)。

核心约定：

- 每个申请使用稳定 archive primary key，例如 `APP-2026-ALI-001`；只是主键，不替代 JD/公司/状态。
- 必须保存完整 JD snapshot。
- 给定 `application_id`，固定读取 `application_record.yaml` + `jd_snapshot.md`；找不到 ID 或任一 required file 必须停止，不能猜。
- 不把 requisition ID、数据库 numeric row ID、当前 UI applicationId 混同为 archive primary key，除非显式 mapping。
- 当前尚未创建 archive repo/packages。

推荐路径：

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

## 10. 安全与操作规则

- `CV` private；Job Radar public。
- `CV_GITHUB_TOKEN` 不得写入聊天、代码、README、PR 或日志。
- private evidence/gold dataset 不得复制到 public repo。
- 不声称 test/CI 通过，除非有实际 execution artifact/status。
- repo 修改通过 branch + PR，不直接写 main。
- 不重新生成 embeddings、不调 legacy scoring、不切 consumer、不修改 CV templates、不针对具体 JD 生成 CV、不创建 application archive repo，除非未来另行授权。

## 11. 新 Chat 推荐入口

```text
继续 XinyuIvy/CV 与 XinyuIvy/ivy-job-radar 的 Job Application / CV Knowledge Base 项目。先读取 PROJECT_HANDOFF.md，并重新检查两个仓库最新 main、branches、PR、Actions 和可见并发状态。

Stage 1、Stage 2 canonical card graph、canonical deterministic retrieval/index compilation，以及 42-query retrieval evaluation dataset + frozen legacy Hybrid RAG baseline 已完成。Evaluation merge 为 CV PR #15 -> a4e376b4aa2b4704a76032a7a063f9fefddb505e。当前 frozen runtime 是 Job Radar commit b857b472fb774d6df337a37072201f188dfc3824。

不要直接开始 RAG v2。先人工审阅 CV/master/project-evidence/evaluation/HUMAN_REVIEW_QUEUE.yaml 的 15 条主观 Direct/Transferable/Adjacent labels。当前 baseline 的主要结论是 project Recall@8≈0.921，但 deterministic classification accuracy≈0.667，Unsupported hard-negative No-Evidence accuracy=0.25，must-not-be-Direct false-positive rate≈0.231，exact canonical-compatible fact-ID recall≈0.462。

不重新生成 embeddings、不调 legacy scoring/fusion/reranking/classification、不切 consumer、不修改 CV templates、不针对具体 JD 生成 CV、不创建 application archive repo，除非用户另行授权。
```
