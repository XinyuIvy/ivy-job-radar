# Job Application / CV Knowledge Base 项目交接

最后更新：2026-08-09（America/New_York）

> 本文件是新 Chat 的接管入口。开始任何修改前，必须重新读取 `XinyuIvy/CV` 与 `XinyuIvy/ivy-job-radar` 的最新 `main`、branches、recent commits、开放 PR、Actions、相关 handoff/manifest 和可见未提交状态。GitHub 当前状态优先于本文记录的 SHA。不要与另一个 Chat 同时写同一仓库。

## 1. 当前状态

系统分工：

1. `XinyuIvy/CV`：原始证据、canonical cards、ontology、deterministic retrieval artifacts、CV templates。
2. `XinyuIvy/ivy-job-radar`：岗位/JD/申请状态、CV Tailor UI、当前运行中的 Hybrid RAG prototype。
3. `job-application-archive`：未来申请包仓库，尚未创建；当前不要创建。

截至本次 handoff：

- Stage 1 原始证据完整性审计：**完成**。
- 15 个 major projects：**全部 Ready for bounded Stage 2**。
- Stage 2 canonical structured knowledge layer：**完成并验证**。
  - 15 Project Cards
  - 37 Atomic Fact Cards
  - 14 Capability Cards
  - 18 Ontology Concepts
- canonical deterministic retrieval/index compilation：**已完成并实际生成 validation report**。
  - 15 project records
  - 37 fact records
  - 14 capability records
  - 18 concept records
  - 84 unified retrieval records
  - 118 explicit relations
- 旧 Stage 2–7、旧 JSONL indexes、旧 compiler、当前 Job Radar Hybrid RAG 全部保留为 `legacy / prototype / baseline`。
- 没有重新生成 embeddings，没有修改 RAG scoring/fusion/reranking/classification，没有开始 RAG v2，没有建立 evaluation dataset，没有修改 CV templates，没有针对具体 JD 生成 CV。

### 本次 GitHub 状态与 PR

本阶段开始时：

- `CV` main：`3326202f88eb6c6a2cb248326522e5ef288e1a54`
- `ivy-job-radar` main：`bf6fdbb0fcc5f4c9fb6aeb1416bbf2418ca62afc`

CV 原先没有 main workflow。为了让 feature PR 能真正执行 compiler/validator，先通过独立 PR bootstrap workflow：

- CV PR #6：`Bootstrap canonical retrieval validation workflow`
- squash merge：`94649367908ab264f3743fbb99a09c615b2d9a76`
- 只新增 `.github/workflows/canonical-retrieval-validation.yml`
- 没有修改知识库、旧 indexes、RAG 或 CV templates

第一次 canonical artifact generation/validation 在：

- branch：`agent/canonical-retrieval-index-20260809`
- 历史 PR #5：首次生成并提交 `CANONICAL_*` artifacts + passing validation report；后来仅因 bootstrap workflow 已进入 main，需要刷新 PR base 而关闭，并非撤回实现。

最终 CV 验收 PR：

- **PR #7：`Compile canonical Stage 2 retrieval indexes`**
- base：当前 main（包含 PR #6 workflow）
- head branch：`agent/canonical-retrieval-index-20260809`
- handoff 更新时最近人工 commit：`181a4fcbd9c88945669ae690ad748864336ede6e`

Job Radar handoff 更新：

- branch：`agent/update-canonical-retrieval-handoff-20260809`
- 仅更新本 `PROJECT_HANDOFF.md`

新 Chat 必须重新读取 PR #7 当前 head / main，不要假定这些 SHA 永远最新。

## 2. 事实边界

最终系统需要区分：真实完成的 method/tool/problem、统计概念、transferable capability，以及 Direct / Strong Transferable / Adjacent / No Evidence。

不能违反：

- Transferable 不能写成真实行业经验。
- Adjacent 不能写成 direct experience。
- planned / proposal 不能写成 completed。
- project-level method 不能自动变成个人贡献。
- `FACT_MASTER.md`、旧 CV bullets、聊天总结、旧 industry translation 不能创造新事实。
- BM25、hash embedding、graph distance、reranking score、历史 classification 不能建立事实真值。
- capability/ontology 是 abstraction，不是新 evidence。
- production deployment、监管、client delivery、因果、交易/alpha/backtest、LLM/RL/fine-tuning 等必须有直接证据。
- downstream record 必须保留 ownership、status、source refs、allowed expression、prohibited expansion。

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

当前规模：15 / 37 / 14 / 18。

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

这些新 artifacts 与旧 indexes 并存。

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

### evidence_strength 不是 ranking score

Stage 2 没有一个合法的 numerical evidence-confidence probability，因此 compiler 没有发明数值。

使用 non-ranking source/scope labels：

- `canonical_authoritative`
- `canonical_authoritative_plus_user_confirmed`
- `bounded_project_context`
- `bounded_planned_design`
- `canonical_derived`

并明确：

```yaml
ranking_semantics: none
```

### guardrails 不进入正向 retrieval text

正向 `retrieval_text` 只使用 project/fact/capability/concept 的安全 positive fields。

以下继续是结构化 metadata，不被揉成普通文本后丢失：

- ownership
- status
- source refs
- evidence strength
- allowed expression
- prohibited expansion

## 5. Relation index

显式 relation 总数 = 118：

- `project_has_fact` = 37
- `fact_supports_capability` = 49
- `capability_maps_to_concept` = 22
- `concept_has_parent` = 10

关系只用于导航/检索，不能制造新事实；不 materialize transitive path 后当 direct evidence。

## 6. 实际 build / validation 结果

`CANONICAL_RETRIEVAL_BUILD_MANIFEST.yaml` 保存：

- 9 个 canonical input SHA-256
- 6 个 JSONL output SHA-256
- counts
- `legacy_baseline_preserved: true`
- `embeddings_regenerated: false`
- `retrieval_scoring_changed: false`
- `consumer_switched: false`

实际 counts：

```text
project_records = 15
fact_records = 37
capability_records = 14
concept_records = 18
unified_retrieval_records = 84
relation_records = 118
```

`CANONICAL_RETRIEVAL_VALIDATION_REPORT.yaml` 是 compiler/validator 实际执行后生成并提交到 feature branch 的 execution artifact。以下均 `passed`：

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

scope：

```text
embeddings_regenerated = false
hybrid_rag_scoring_changed = false
consumer_switched = false
cv_templates_modified = false
evaluation_dataset_created = false
```

## 7. 重要项目 guardrails

### NeuroStat

Canonical facts `NVL-001/002` 都是 planned/design-only。

可写：设计 single/two/four-agent workflow、blinded evaluation plan。

不可写：two/four-agent 已实现、已评估、已优于 single agent、已有 reviewer scores、做过 PPO/DPO/GRPO/RL training/fine-tuning。

旧 `FACT_INDEX_STATUS_ADDENDUM.jsonl` 中的 `NSVL-007` single-agent in-progress record 是 legacy，不在 37 canonical facts 中，新 compiler 不导入。

### Markov-switching Matrix AR

Canonical ownership：`collaborator_project_level_only`。

只能把 Markov-switching matrix autoregression / matrix-normal likelihood / EM-style estimation 作为 project context；当前 canonical Stage 1/2 不自动升级旧 personal derivative/R preprocessing claims。

### Lumbosacral 两项目

用户确认：主要负责全部统计分析 + manuscript statistical sections review。

必须保留 user-confirmed provenance；不能伪装成 manuscript CRediT，也不能扩到 imaging acquisition/preprocessing/sequence development/study conception。

### MAPA

coauthor + preprint/project context；保持 preprint_not_peer_reviewed。不能声称个人发明 method 或 lead analysis。

### Pfizer

Direct admitted：negative-binomial recurrent-event/AER、Monte Carlo、sensitivity、composite-endpoint evaluation。

不能写 joint longitudinal/copula implementation，不能扩大为 regulatory authority。

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

CV PR #7 已修正 README 与 `CONTENT_FREEZE_MANIFEST.yaml`：旧 Stage 3–7 不再被文档称为 canonical。

## 9. 旧 build pipeline 为什么不能继续当 canonical

旧 `FACT_INDEX_BUILD_SPEC.yaml` 和 `scripts/build_fact_index.py` 直接读取/连接：

- `STAGE2_EVIDENCE_MAP.yaml`
- Stage 3 facts
- Stage 4 capability layers
- Stage 5 translations
- Stage 6 graph

所以它们只能继续作为 legacy compiler/spec。

新 `build_canonical_retrieval.py` 只读取用户明确指定的 9 个 canonical files，不导入旧 Stage 2–7 或旧 retrieval status addendum。

## 10. Job Radar runtime 仍然消费 legacy indexes

`app/api/cv-tailor/analyze/route.ts` 当前仍读：

- `FACT_INDEX.jsonl`
- `FACT_INDEX_STATUS_ADDENDUM.jsonl`
- `CONCEPT_EDGES.jsonl`
- `CREDENTIAL_INDEX.jsonl`
- `COURSEWORK_INDEX.jsonl`
- `PROFILE_INDEX.jsonl`
- `LITERATURE_INDEX.jsonl`

`app/lib/hybrid-rag.ts` 仍使用旧 FactIndexRecord/ConceptEdge schema 和现有 scoring/classification。

**本阶段没有 switch consumer。**

后续 consumer integration 必须单独做，避免 source schema migration 和 scoring changes 混在一次改动中。

## 11. RAG 技术演进（面试保留）

### 11.1 Legacy：FACT_MASTER + alias overlap

最早：完整 JD → aliases → FACT_MASTER project sections → literal overlap → gap analysis。

没有 BM25、embedding、graph 或真正 reranking。

### 11.2 Structured knowledge contract，但仍是 lexical weighting

历史加权示例：

- exact method 5
- statistical concept 4
- problem solved 4
- transferable capability 3
- domain 2
- industry translation 3
- verified fact 1
- high evidence ×1.12
- low evidence ×0.75

这仍不是 neural semantic RAG。

### 11.3 Evidence-grounded atomic facts

后续加入 fact_id、status、personal attribution、evidence strength、source/location、claim boundary，并逐渐把 FACT_MASTER 降为非权威材料。

### 11.4 第一版 Hybrid RAG

新增：

1. exact/direct overlap
2. BM25
3. local dense hashing channel
4. concept graph expansion
5. industry translation overlap
6. preverification score
7. status/ownership/scope/overclaim guardrails

### 11.5 Structured profile evidence

学历、课程、skills、publications、service、awards 走独立 deterministic structured matching；coursework 不允许直接成为 professional implementation。

### 11.6 Fact corpus 与 CV template corpus 分离

- fact index：有没有证据？
- template index：当前 CV 是否已表达？

### 11.7 JD atomic requirements

Alibaba 等 regression case 推动 RL/PPO/DPO/GRPO/reward design/training stability/tool calling/code execution 等拆成原子要求；named method/tool 无 exact evidence 时有 hard ceiling。

## 12. 当前旧 Hybrid RAG 的精确技术实现

### Tokenization

- NFKC
- lower-case
- dash/underscore/slash → spaces
- small English stop-word set
- simple stemming：`collaborat*`、`-ing`、`-ed`、plural `-s`
- Chinese character bigrams

set similarity：

```text
overlap_count / sqrt(|left| * |right|)
```

### Dense channel：384-d signed subword hashing，不是 pretrained embedding

- tokens + character trigrams
- FNV-1a 32-bit
- bucket = `hash % 384`
- hash low bit 决定 ±1
- L2 normalize
- cosine / dot product，negative clipped to 0

```text
v[h(f) mod 384] += sign(h(f))
v <- v / ||v||2
similarity(q,d) = max(0, q^T d)
```

面试安全表述：

> Implemented a deterministic 384-dimensional signed subword-hashing retrieval channel for a serverless prototype; it was not a pretrained neural embedding model.

不要说使用 OpenAI embeddings、Sentence-BERT、BGE 或 E5。

### BM25

- `k1 = 1.5`
- `b = 0.75`

```text
IDF = log(1 + (N - df + 0.5) / (df + 0.5))
```

### Concept graph

最多约 2 hops；path score 由 edge weights 连乘。Adjacent path 不能通过后续 transferable edge 人为升级。Graph 只扩召回，不创造 ownership/status/evidence truth。

### 历史 preverification weights

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

## 13. 为什么旧 RAG 效果不好

不是单一原因：

1. 最早 source corpus 未先完成 authoritative audit。
2. retrieval similarity 与 evidence adjudication 混在一起。
3. 384-d hashing 不理解完成状态、ownership、否定、scope。
4. aliases 对已知 JD 有效但泛化有限。
5. requirement 过度按标点拆分会丢上下文。
6. per-requirement top-k 不能完成两页 CV 的全局项目选择。
7. thresholds/weights 未经过人工标注 benchmark 校准。
8. concept graph 可以产生合理联系，但不能创造事实。
9. runtime 曾承担过多 classification/recommendation；更合理的分工是 RAG 找 evidence，全局模型做 evidence-bounded selection/adjudication。

## 14. 下一阶段入口

**当前阶段完成后停止，不要顺手开始 RAG v2。**

用户明确说 evaluation dataset 在本阶段之后单独做。因此下一阶段推荐：

### RAG Evaluation Dataset / Baseline Evaluation

1. 重新核 CV PR #7 当前状态/是否合并。
2. 重跑 canonical retrieval validator。
3. 保存 Job Radar legacy RAG outputs 作为 baseline。
4. 定义 gold schema：完整 JD → atomic requirements → relevant fact IDs → expected classification → hard scope conflict → prohibited wording → project selection。
5. 建立高质量中英文、跨 Pharma/Tech/Quant/Consulting 的人工标注小集。
6. 评估 Recall@k、MRR/nDCG、classification precision/recall、Direct false-positive、overclaim rate、citation accuracy、project-selection agreement。

在 benchmark 前：

- 不重新生成/替换 embeddings
- 不调 scoring thresholds
- 不开始 RAG v2
- 不静默切换 Job Radar consumer

另一个独立阶段才做 canonical consumer integration；必须用 compatibility adapter，让“换 source schema”和“换 scoring algorithm”分开验证。

## 15. 仍存风险

- Job Radar runtime 还没消费 `CANONICAL_*`。
- non-project credentials/coursework/profile/literature 尚未纳入本次 canonical graph；它们仍在 legacy structured indexes。
- 新 `evidence_strength` 是 source/scope descriptor，不是 confidence score。
- 没有 dedicated committed RAG query log。
- GitHub 看不到另一个环境尚未 push 的 local worktree；每次接管仍需先检查最新远端状态并避免并行写。

## 16. Job Radar 非 RAG 状态

已有：多源岗位、申请状态、CV Tailor、private CV reader、structured evidence、pending optimistic update、收藏/核验即时更新、取消工资过滤等。

后续产品工作仍包括：application status transitions shared state、delete/rollback/undo 一致化、public repo 历史隐私审计、Site 部署同步、未来 application archive 端到端流程。

这些都不是本次 canonical retrieval compilation 的内容。

## 17. 安全与操作规则

- `CV` private；Job Radar public。
- `CV_GITHUB_TOKEN` 不得写进聊天、代码、README、PR 或日志。
- private evidence 不得复制到 public repo。
- 不要声称 test/CI 通过，除非实际执行或有 execution artifact/report。
- 不要直接写 main；使用 branch + PR。
- 不要在未授权时修改 CV templates、生成具体 JD CV、创建 application archive repo。

## 18. 新 Chat 推荐开场指令

```text
继续 XinyuIvy/CV 的 Job Application / CV Knowledge Base 项目。先完整读取 XinyuIvy/ivy-job-radar/PROJECT_HANDOFF.md，并重新检查两个仓库当前 main、branches、PR、Actions 和可见并发状态。

Stage 1、Stage 2 canonical card graph，以及 canonical deterministic retrieval compilation 已完成。最终 CV 验收 PR 是 #7。旧 Stage 2–7、FACT_INDEX/CONCEPT_EDGES/build_fact_index.py 和当前 Job Radar Hybrid RAG 是 preserved legacy/prototype baseline，不是 canonical evidence source。

下一阶段不要直接做 RAG v2。优先按用户新指令建立 RAG evaluation dataset / baseline evaluation；若用户改为 consumer integration，也必须单独做 compatibility adapter，不改变 scoring algorithm。不要重新生成 embeddings、不要用旧 retrieval score 证明事实、不要修改 CV templates 或针对具体 JD 生成 CV，除非用户另行授权。
```
