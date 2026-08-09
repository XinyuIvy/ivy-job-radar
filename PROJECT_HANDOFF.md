# Job Application / CV Knowledge Base 项目交接

最后更新：2026-08-09（America/New_York）

> 新 Chat 接手时先重新读取 `XinyuIvy/CV` 与 `XinyuIvy/ivy-job-radar` 的最新 `main`、branches、recent commits、开放 PR、Actions、manifest/handoff 与可见并发状态。GitHub 当前状态优先于本文记录的 SHA。不要与另一个 Chat 同时写同一仓库。

## 1. 系统分工与当前状态

1. `XinyuIvy/CV`：原始证据、canonical cards、ontology、deterministic retrieval artifacts、CV templates。
2. `XinyuIvy/ivy-job-radar`：岗位/JD/申请状态、CV Tailor UI、当前运行的 legacy Hybrid RAG prototype。
3. 未来私有 `XinyuIvy/job-application-archive`：申请包；**尚未创建**。

已完成：

- Stage 1 原始证据审计完成，15 个 major projects 全部 Ready for bounded Stage 2。
- Stage 2 canonical graph 完成并验证：15 Project Cards / 37 Atomic Fact Cards / 14 Capability Cards / 18 Ontology Concepts。
- canonical deterministic retrieval/index compilation 已进入 CV main，并在合并后的 main 状态重跑通过：15 project / 37 fact / 14 capability / 18 concept / 84 unified retrieval / 118 relations。
- legacy Stage 2–7、旧 JSONL indexes、旧 compiler 和 Job Radar current Hybrid RAG 全部保留为 `legacy / prototype / baseline`。
- 尚未重新生成 embeddings，尚未改 scoring/fusion/reranking/classification，尚未切换 consumer，尚未开始 RAG v2。

## 2. Canonical retrieval 最终验收链

阶段开始时：CV main `3326202f88eb6c6a2cb248326522e5ef288e1a54`；Job Radar main `bf6fdbb0fcc5f4c9fb6aeb1416bbf2418ca62afc`。

关键 CV PR/commit：

- PR #6 workflow bootstrap → `94649367908ab264f3743fbb99a09c615b2d9a76`
- PR #9 fork-safe workflow fix → `bcd641c5c94ccb4959f6b0891820411d9ce05e2b`
- PR #7 canonical retrieval implementation → `23d6ef58408cebc320483c3475282816c9c3ab19`
- PR #11 post-merge revalidation record → `4591d6bae22ea998cf4409a5b21f0bbd3669ee7f`
- PR #12 main-push validation → `a8386e807cd7b0c440fd9002b0accf6995906c72`
- PR #13 verifiable main validation status → `cc65aeb445de39d5289bd547933f316eb166f205`

CV current acceptance evidence：commit `cc65aeb445de39d5289bd547933f316eb166f205` has status `canonical-retrieval-main = success`。

实际 post-merge revalidation：

```text
projects = 15
facts = 37
capabilities = 14
concepts = 18
unified retrieval records = 84
relations = 118
source_traceability_violations = 0
cross_record_consistency_violations = 0
compiled_content_drift_violations = 0
artifacts changed by rebuild = false
```

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

每条 canonical entity record 保留 stable ID、project linkage、status、ownership、source refs、non-ranking evidence-strength labels、allowed expression、prohibited expansion、retrieval fields/text。`evidence_strength.ranking_semantics = none`；guardrails 不被揉进 positive retrieval text 后丢失结构。

Relation index = 118：37 `project_has_fact` + 49 `fact_supports_capability` + 22 `capability_maps_to_concept` + 10 `concept_has_parent`。

## 4. 必须保留的 legacy/prototype baseline

不能删除、也不能当 canonical truth：

- `STAGE2_EVIDENCE_MAP.yaml`
- `STAGE3_ATOMIC_FACTS.yaml` / collaborative addendum
- old Stage 4 capability layers/addenda
- old Stage 5 industry translations/addenda
- old Stage 6 graph/addenda
- old Stage 7 matching specs/addenda
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

Job Radar runtime **仍消费 legacy indexes**。`app/api/cv-tailor/analyze/route.ts` 当前读 `FACT_INDEX.jsonl + FACT_INDEX_STATUS_ADDENDUM.jsonl + CONCEPT_EDGES.jsonl + structured profile indexes`；`app/lib/hybrid-rag.ts` 仍是旧 schema/scoring/classification。不要在 evaluation 阶段切 consumer。

## 5. 关键事实/ownership/status guardrails

- Transferable ≠ 真实行业经验；Adjacent ≠ Direct。
- planned/proposal ≠ completed。
- project-level method ≠ 个人贡献。
- FACT_MASTER、旧 CV bullets、legacy Stage 2–7、旧 retrieval rankings 不能创建 gold facts。
- retrieval score、embedding similarity、BM25、graph distance 不是事实真值。
- capability/ontology 是 abstraction，不是独立 evidence。

项目边界：

- NeuroStat `NVL-001/002` 为 planned/design-only；旧 `NSVL-007` 是 legacy，不在 37 canonical facts。
- Markov-switching Matrix AR 当前 canonical ownership = `collaborator_project_level_only`。
- 两个 lumbosacral 项目：用户确认主要负责全部统计分析 + statistical-section review；必须标 user-confirmed，不能伪装为 manuscript CRediT。
- MAPA：coauthor + preprint/project context；不能升级成个人方法发明/lead analysis，也不能称 peer reviewed。
- Pfizer：direct admitted 为 negative-binomial recurrent-event/AER、Monte Carlo、sensitivity、composite-endpoint evaluation；不能写 joint longitudinal/copula/regulatory authority。
- Readmission：temporal validation ≠ prospective deployment / another-institution external validation。
- RESI：`up to about 50x faster` 必须保留 benchmark context。
- Model Reliance：model reliance ≠ causal importance；working manuscript ≠ published；research analysis ≠ production deployment。

## 6. Legacy Hybrid RAG 技术冻结说明

### Tokenization

- Unicode NFKC、lower-case、dash/underscore/slash → spaces
- small English stop-word set
- simple stemming：`collaborat*`, `-ing`, `-ed`, plural `-s`
- Chinese character bigrams
- set similarity = `overlap_count / sqrt(|left| * |right|)`

### Dense channel：`local_subword_hash_v1`

不是 pretrained embedding：384-d signed feature hashing，token + char trigrams，FNV-1a 32-bit，bucket `hash % 384`，hash low bit 决定 ±1，L2 normalize，cosine/dot product，negative clipped to 0。

安全表述：

> Implemented a deterministic 384-dimensional signed subword-hashing retrieval channel for a serverless prototype; it was not a pretrained neural embedding model.

不要说使用 OpenAI embeddings、Sentence-BERT、BGE、E5。

### BM25

`k1 = 1.5`, `b = 0.75`; IDF = `log(1 + (N - df + 0.5) / (df + 0.5))`。

### Concept graph

最多约 2 hops；path score = edge weights 连乘。Adjacent path 不能靠后续 transferable edge 人为升级。Graph 只扩召回，不创造 ownership/status/evidence truth。

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

旧 RAG 效果不佳的主要原因：早期 source authority 未先统一；similarity 与 evidence adjudication 混在一起；384-d hashing 不理解 status/ownership/negation/scope；alias 泛化有限；JD 原子化可能丢上下文；per-requirement top-k 不能做整份 CV 全局选择；weights/thresholds 未 benchmark 校准；graph 能产生合理联系但不能创造事实。

## 7. 下一阶段：Retrieval Evaluation Dataset / Baseline Evaluation

本阶段目标不是 RAG v2，而是：

1. 审计 query logs、tests、historical results、legacy Hybrid RAG interfaces。
2. 建 evaluation schema + annotation guide。
3. deterministic gold references 只使用 canonical stable IDs。
4. Direct / Transferable / Adjacent 等主观标签必须有明确 human-review state；不能假装已人工确认。
5. 冻结 legacy Hybrid RAG 的 exact implementation/parameters/query inputs/retrieved outputs。
6. 实际运行 baseline，保存 runner、dataset manifest、baseline report、failure categories。
7. 不重新生成 embeddings，不调 scoring/fusion/reranking/classification，不切 production consumer。
8. evaluation 完成后停止；RAG v2 另开阶段。

Query coverage 至少包括 methods/tools、research/business problems、ownership、capability/ontology、cross-industry transferable、adjacent、unsupported、overclaim traps、planned/in-progress/preprint/user-confirmed provenance。

## 8. Future application archive contract（已恢复并单独固化）

Durable specification：[`docs/APPLICATION_ARCHIVE_CONTRACT.md`](docs/APPLICATION_ARCHIVE_CONTRACT.md)。

核心约定：

- 每个申请使用稳定 archive primary key，例如 `APP-2026-ALI-001`；它只是主键，不替代 JD/公司/状态。
- 未来 archive 必须保存**完整 JD snapshot**，不能只留 URL/关键词/摘要。
- 给定 `application_id`，下游固定读取 `application_record.yaml` + `jd_snapshot.md`；找不到 ID 或任一 required file 必须停止，不能猜。
- 推荐路径：

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

- 不把 requisition ID、数据库 numeric row ID、当前 UI applicationId 混同为 archive primary key，除非存在显式 mapping。
- 当前 retrieval evaluation 阶段**不得创建** application archive repo 或 packages。

## 9. 安全与操作规则

- `CV` private；Job Radar public。
- `CV_GITHUB_TOKEN` 不得写入聊天、代码、README、PR 或日志。
- private evidence 不得复制到 public repo。
- 不声称 test/CI 通过，除非实际 execution artifact/status 可核验。
- 所有 repo 修改通过 branch + PR，不直接写 main。
- 不重新生成 embeddings、不修改 CV templates、不针对具体 JD 生成 CV、不创建 application archive repo，除非未来另行授权。

## 10. 新 Chat 推荐入口

```text
继续 XinyuIvy/CV 与 XinyuIvy/ivy-job-radar 的 Job Application / CV Knowledge Base 项目。先读取 PROJECT_HANDOFF.md，并重新检查两个仓库最新 main、branches、PR、Actions 和可见并发状态。

Stage 1、Stage 2 canonical card graph、canonical deterministic retrieval/index compilation 已完成并进入 CV main。canonical retrieval implementation merge 为 PR #7 -> 23d6ef58408cebc320483c3475282816c9c3ab19；post-merge revalidation PR #11 -> 4591d6bae22ea998cf4409a5b21f0bbd3669ee7f；main Actions/status 最终验收锚点为 cc65aeb445de39d5289bd547933f316eb166f205，status canonical-retrieval-main=success。

下一阶段只做 retrieval evaluation dataset / legacy baseline evaluation。不要开始 RAG v2，不重新生成 embeddings，不调 scoring/fusion/reranking/classification，不切 consumer，不修改 CV templates，不针对具体 JD 生成 CV，不创建 application archive repo。
```
