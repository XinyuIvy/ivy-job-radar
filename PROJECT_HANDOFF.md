# Job Application / CV Knowledge Base 项目交接

最后更新：2026-08-09（America/New_York）

> 本文件是新 Chat 的接管入口。开始任何修改前，必须重新读取 `XinyuIvy/CV` 与 `XinyuIvy/ivy-job-radar` 的最新 `main`、branches、recent commits、开放 PR、Actions、相关 handoff/manifest 和可见未提交状态。GitHub 当前状态优先于本文记录的 SHA。不要与另一个 Chat 同时写同一仓库。

## 1. 当前状态

系统分工：

1. `XinyuIvy/CV`：原始证据、canonical cards、ontology、deterministic retrieval artifacts、CV templates。
2. `XinyuIvy/ivy-job-radar`：岗位/JD/申请状态、CV Tailor UI、当前运行中的 Hybrid RAG prototype。
3. `job-application-archive`：未来申请包仓库，尚未创建；当前不要创建。

当前已完成：

- Stage 1 原始证据完整性审计：**完成**。
- 15 个 major projects：**全部 Ready for bounded Stage 2**。
- Stage 2 canonical structured knowledge layer：**完成并验证**。
  - 15 Project Cards
  - 37 Atomic Fact Cards
  - 14 Capability Cards
  - 18 Ontology Concepts
- canonical deterministic retrieval/index compilation：**已合并到 CV main，并在合并后的 main 状态上重新验证通过**。
  - 15 project records
  - 37 fact records
  - 14 capability records
  - 18 concept records
  - 84 unified retrieval records
  - 118 explicit relations
- 旧 Stage 2–7、旧 JSONL indexes、旧 compiler、当前 Job Radar Hybrid RAG 全部保留为 `legacy / prototype / baseline`。
- 没有重新生成 embeddings，没有修改 RAG scoring/fusion/reranking/classification，没有切换 Job Radar consumer，没有开始 RAG v2，没有修改 CV templates，没有针对具体 JD 生成 CV。

## 2. Canonical retrieval 上一阶段最终 GitHub 验收链

阶段开始前：

- `CV` main：`3326202f88eb6c6a2cb248326522e5ef288e1a54`
- `ivy-job-radar` main：`bf6fdbb0fcc5f4c9fb6aeb1416bbf2418ca62afc`

### 2.1 Validation workflow bootstrap

CV 原先没有 main workflow，为了让 canonical feature PR 真正执行 compiler/validator，先通过独立 PR 增加 workflow：

- CV PR #6：`Bootstrap canonical retrieval validation workflow`
- merge commit：`94649367908ab264f3743fbb99a09c615b2d9a76`

之后 Codex review 发现 fork PR checkout 风险，单独修复：

- CV PR #9：`Fix canonical validation checkout for fork PRs`
- merge commit：`bcd641c5c94ccb4959f6b0891820411d9ce05e2b`
- 修复内容：checkout 明确使用 PR head repository + exact SHA；fork PR 不允许 Actions 自动 push regenerated artifacts；workflow-only maintenance PR 可在 compiler 尚未进入 main 时只跑 Stage 2 validation。

### 2.2 Canonical deterministic retrieval/index compilation

首次 generation/validation 历史：

- branch：`agent/canonical-retrieval-index-20260809`
- PR #5：首次生成并提交 `CANONICAL_*` artifacts + passing validation report；后因 workflow bootstrap 进入 main，需要刷新 base 而关闭，不是撤回实现。

最终 canonical retrieval PR：

- CV PR #7：`Compile canonical Stage 2 retrieval indexes`
- merge commit：`23d6ef58408cebc320483c3475282816c9c3ab19`

PR #7 在修复后的 workflow 上实际运行成功；Stage 2 validator、canonical compiler、canonical validator 和 deterministic artifact check 全部通过。

### 2.3 Post-merge revalidation

为了验证“合并后的 main 状态”而不是仅验证 feature PR，创建了独立 post-merge acceptance PR：

- CV PR #11：`Revalidate canonical retrieval after main merge`
- target canonical merge：`23d6ef58408cebc320483c3475282816c9c3ab19`
- Actions run：`31324741341`
- record merge commit：`4591d6bae22ea998cf4409a5b21f0bbd3669ee7f`

实际重新运行结果：

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

### 2.4 Main push Actions hard evidence

为避免“merge commit 本身没有可查询 Actions 证据”，workflow 后续增加 main-push validation：

- CV PR #12：`Validate canonical retrieval on main pushes`
- merge commit：`a8386e807cd7b0c440fd9002b0accf6995906c72`
- push path 会重跑 Stage 2 validation + canonical compiler + canonical validator，并用 `git diff --exit-code` 检查 generated artifact drift；不由 Actions 写 main。

随后增加可通过 GitHub status API 核验的成功状态：

- CV PR #13：`Publish canonical main validation status`
- merge commit / 当前本次验收锚点：`cc65aeb445de39d5289bd547933f316eb166f205`
- commit status：`canonical-retrieval-main = success`

因此 canonical retrieval 上一阶段已经正式进入 main，并且有 main-level validation hard evidence。

## 3. 当前唯一 canonical chain

### Stage 1

`XinyuIvy/CV/master/project-evidence/STAGE1_COMPLETION_MANIFEST.yaml`

负责 authoritative-source admission、版本、provenance、gaps、user-confirmed attribution 和 readiness。

### Stage 2 canonical card graph

- `STAGE2_CANONICAL_MANIFEST.yaml`
- `STAGE2_SCHEMA.yaml`
- `STAGE2_PROJECT_CARDS.yaml`
- `STAGE2_FACT_CARDS.yaml`
- `STAGE2_CAPABILITY_CARDS.yaml`
- `STAGE2_ONTOLOGY.yaml`
- `STAGE2_COMPILED_MODEL_CONTEXT.yaml`
- `STAGE2_VALIDATION_REPORT.yaml`
- `scripts/validate_stage2_cards.py`

当前规模：15 projects / 37 facts / 14 capabilities / 18 concepts。

### Canonical deterministic retrieval layer

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

这些 artifacts 与旧 indexes 并存；当前 Job Radar runtime 尚未消费它们。

## 4. Canonical retrieval record contract

每条 entity record 保留：

- `record_id`
- `record_type`
- `entity_id`
- `project_ids`
- `status`
- `ownership`
- `source_refs`
- `evidence_strength`
- `allowed_expression`
- `prohibited_expansion`
- `retrieval_fields`
- `retrieval_text`

稳定 IDs：

```text
project:<project_id>
fact:<fact_id>
capability:<capability_id>
concept:<concept_id>
```

`evidence_strength` 不是 ranking score。Stage 2 没有合法的 numerical evidence-confidence probability，因此 compiler 使用 non-ranking source/scope labels，并明确 `ranking_semantics: none`。

Guardrails 不进入正向 retrieval text；ownership/status/source refs/evidence strength/allowed expression/prohibited expansion 继续作为结构化 metadata。

## 5. Relation index

显式 relation 总数 = 118：

- `project_has_fact` = 37
- `fact_supports_capability` = 49
- `capability_maps_to_concept` = 22
- `concept_has_parent` = 10

关系只用于导航/检索，不能制造新事实，不把 transitive path materialize 后冒充 direct evidence。

## 6. Canonical validation 已实际通过的检查

`CANONICAL_RETRIEVAL_VALIDATION_REPORT.yaml` 与 post-merge Actions 均确认：

- schema_and_required_fields
- globally_unique_record_ids
- project_linkage_integrity
- exact_fact_source_preservation
- stage1_source_admission_traceability
- capability_support_integrity
- ontology_reference_integrity
- relation_set_exactness
- guardrail_field_preservation
- no_guardrail_flattening_into_retrieval_text
- prohibited_overclaim_boundary
- deterministic_repeatability
- compiled_content_drift

均通过。

Scope 仍是：

```text
embeddings_regenerated = false
hybrid_rag_scoring_changed = false
consumer_switched = false
cv_templates_modified = false
evaluation_dataset_created = false   # 在 canonical compilation 阶段结束时
```

## 7. 重要事实边界

任何下一阶段都必须继续遵守：

- Transferable 不能写成真实行业经验。
- Adjacent 不能写成 direct experience。
- planned / proposal 不能写成 completed。
- project-level method 不能自动变成个人贡献。
- `FACT_MASTER.md`、旧 CV bullets、聊天总结、legacy industry translation 不能创造新事实。
- BM25、hash embedding、graph distance、reranking score、历史 classification 不能建立事实真值。
- capability/ontology 是 abstraction，不是新 evidence。
- production deployment、监管、client delivery、因果、交易/alpha/backtest、LLM/RL/fine-tuning 等必须有直接证据。

关键项目：

### NeuroStat

Canonical facts `NVL-001/002` 是 planned/design-only。可以写设计 single/two/four-agent workflow 和 blinded evaluation plan；不可写 two/four-agent 已实现/已评估、已有 reviewer scores、RL/PPO/DPO/GRPO/fine-tuning 已完成。

旧 `FACT_INDEX_STATUS_ADDENDUM.jsonl` 的 `NSVL-007` 是 legacy，不在 37 canonical facts 中。

### Markov-switching Matrix AR

Canonical ownership：`collaborator_project_level_only`。只能写 project context；旧 personal derivative/R preprocessing claims 没有被当前 canonical chain 自动重新准入。

### 两个 Lumbosacral 项目

用户确认主要负责全部统计分析 + manuscript statistical sections review。必须保留 user-confirmed provenance，不伪装成 manuscript CRediT，不扩到 acquisition/preprocessing/sequence development/study conception。

### MAPA

coauthor + preprint/project context；必须保留 preprint status，不能声称个人发明方法或 lead analysis。

### Pfizer

Direct admitted：negative-binomial recurrent-event/AER、Monte Carlo、sensitivity、composite-endpoint evaluation。不能写 joint longitudinal/copula implementation 或 regulatory authority。

### Readmission

Temporal validation ≠ prospective deployment ≠ another-institution external validation。

### RESI

`up to about 50x faster` 必须保留 benchmark context。

### Model Reliance

model reliance ≠ causal feature importance；working manuscript ≠ published paper；research analysis ≠ production deployment。

## 8. 必须保留的 legacy / prototype baseline

以下不是当前 canonical evidence source，但不能删除：

- `STAGE2_EVIDENCE_MAP.yaml`
- `STAGE3_ATOMIC_FACTS.yaml`
- `STAGE3_COLLABORATIVE_ADDENDUM.yaml`
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

`STAGE1_RAG_BASELINE.yaml` 是旧 RAG/index preservation inventory。

旧 `FACT_INDEX_BUILD_SPEC.yaml` / `build_fact_index.py` 直接依赖 legacy Stage 2–6，所以只能继续作为 legacy compiler/spec。

## 9. Job Radar runtime 仍消费 legacy indexes

`app/api/cv-tailor/analyze/route.ts` 当前仍读：

- `FACT_INDEX.jsonl`
- `FACT_INDEX_STATUS_ADDENDUM.jsonl`
- `CONCEPT_EDGES.jsonl`
- `CREDENTIAL_INDEX.jsonl`
- `COURSEWORK_INDEX.jsonl`
- `PROFILE_INDEX.jsonl`
- `LITERATURE_INDEX.jsonl`

`app/lib/hybrid-rag.ts` 仍使用 legacy FactIndexRecord/ConceptEdge schema 和现有 scoring/classification。

**尚未 switch consumer。** Consumer integration 必须是以后单独阶段。

## 10. 旧 Hybrid RAG 技术实现（baseline 冻结时必须保留）

### Tokenization

- Unicode NFKC
- lower-case
- dash/underscore/slash → spaces
- small English stop-word set
- simple stemming：`collaborat*`、`-ing`、`-ed`、plural `-s`
- Chinese character bigrams

集合相似度：

```text
overlap_count / sqrt(|left| * |right|)
```

### Dense channel：`local_subword_hash_v1`

不是 pretrained embedding：

- dimension = 384
- token + character trigram features
- FNV-1a 32-bit
- bucket = `hash % 384`
- sign from hash low bit
- L2 normalization
- cosine/dot product, negative clipped to 0

安全面试表述：

> Implemented a deterministic 384-dimensional signed subword-hashing retrieval channel for a serverless prototype; it was not a pretrained neural embedding model.

不要说使用 OpenAI embeddings、Sentence-BERT、BGE、E5。

### BM25

- `k1 = 1.5`
- `b = 0.75`

```text
IDF = log(1 + (N - df + 0.5) / (df + 0.5))
```

### Concept graph

最多约 2 hops；path score = edge weights 连乘。Adjacent path 不能通过后续 transferable edge 人为升级。Graph 只能扩大召回，不能创造 ownership/status/evidence truth。

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

这些是 heuristic/regression tuning，不是 gold-set calibrated probabilities。

主要 classification/guardrail 行为包括：named method/tool 需要 exact evidence ceiling；embedding-only 不能成为 Direct/Strong Transferable；project_context 强制 No Evidence；planned evidence 有完成状态 ceiling；production/regulatory/causal/client-facing 等 scope 有 guardrail。

## 11. 为什么 legacy RAG 效果不好

1. 早期 source corpus 未先完成 authoritative audit。
2. retrieval similarity 与 evidence adjudication 曾混在一起。
3. 384-d hashing 不理解完成状态、ownership、否定和 scope。
4. aliases 对已知 JD 有效但泛化有限。
5. requirement 过度按标点拆分可能丢上下文。
6. per-requirement top-k 无法完成整份两页 CV 的全局项目组合优化。
7. thresholds/weights 未由人工标注 benchmark 校准。
8. concept graph 可以产生合理联系，但不能创造事实。
9. runtime 曾承担过多 classification/recommendation；更合理的长期分工是 retrieval 找 evidence，全局模型在证据边界内做 selection/adjudication。

## 12. 下一阶段：Retrieval Evaluation Dataset / Baseline Evaluation

Canonical retrieval 上一阶段已经正式关闭。下一阶段的目标不是 RAG v2，而是：

1. 审计已有 query logs / tests / historical results / Hybrid RAG interfaces。
2. 建立 evaluation schema 和 annotation guide。
3. 所有 deterministic gold references 使用 canonical stable IDs。
4. Direct / Transferable / Adjacent 等存在主观判断的标签必须有人工审阅状态，不能假称 human-confirmed。
5. 冻结 legacy Hybrid RAG 当前参数、输入、输出和 failure modes。
6. 运行 baseline evaluation，保存可重复 runner、manifest、report。
7. 不重新生成 embeddings，不调 scoring/fusion/reranking/classification，不切换 production consumer。
8. evaluation 完成后再单独决定是否进入 RAG v2。

Evaluation query 应覆盖：

- specific statistical methods/tools
- research/business problems
- project contribution/ownership
- high-level capability/ontology concepts
- cross-industry transferable capability
- adjacent experience
- unsupported claims
- overclaim traps
- planned / in-progress / preprint / user-confirmed provenance boundaries

至少应报告 retrieval Recall@k、MRR/nDCG（若标注粒度允许）、classification behavior、Direct false-positive/overclaim failures、citation/reference correctness，以及人工 review queue 状态。

## 13. 安全与操作规则

- `CV` private；Job Radar public。
- `CV_GITHUB_TOKEN` 不得写入聊天、代码、README、PR 或日志。
- private evidence 不得复制到 public repo。
- 不要声称 test/CI 通过，除非实际执行或有 execution artifact/status。
- 所有 repo 修改通过 branch + PR；不要直接写 main。
- 不重新生成 embeddings，除非未来明确进入 RAG v2 并单独授权。
- 不修改 CV templates、生成具体 JD CV、创建 application archive repo，除非用户另行授权。

## 14. 新 Chat 推荐开场指令

```text
继续 XinyuIvy/CV 与 XinyuIvy/ivy-job-radar 的 Job Application / CV Knowledge Base 项目。先读取本 PROJECT_HANDOFF.md，并重新检查两个仓库的最新 main、branches、PR、Actions 与可见并发状态。

Stage 1、Stage 2 canonical card graph、canonical deterministic retrieval/index compilation 均已完成并进入 CV main。canonical retrieval 的主要 merge 是 PR #7 -> 23d6ef58408cebc320483c3475282816c9c3ab19；post-merge revalidation PR #11 -> 4591d6bae22ea998cf4409a5b21f0bbd3669ee7f；main push validation/status 最终验收锚点为 cc65aeb445de39d5289bd547933f316eb166f205，status `canonical-retrieval-main=success`。

旧 Stage 2–7、FACT_INDEX/CONCEPT_EDGES/build_fact_index.py 和当前 Job Radar Hybrid RAG 继续作为 preserved legacy/prototype baseline，不是 canonical evidence source，且 runtime 尚未切换到 CANONICAL_*。

下一阶段只做 retrieval evaluation dataset / legacy baseline evaluation。不要开始 RAG v2，不重新生成 embeddings，不调 scoring/fusion/reranking/classification，不切换 consumer，不修改 CV templates，不针对具体 JD 生成 CV，不创建 application archive repo。
```
