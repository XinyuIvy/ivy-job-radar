# Job Application / CV Knowledge Base 项目交接

最后更新：2026-08-09（America/New_York）

> 新 Chat 接手时必须重新读取 `XinyuIvy/CV` 与 `XinyuIvy/ivy-job-radar` 的最新 `main`、开放 PR、recent commits、Actions、manifest/handoff 和可见并发状态。GitHub 当前状态优先于本文记录的 SHA。

## 1. 系统分工

- `XinyuIvy/CV`（private）：authoritative original evidence、canonical cards/ontology、canonical deterministic retrieval artifacts、retrieval evaluation dataset、reviewed gold labels、CV templates。
- `XinyuIvy/ivy-job-radar`（public）：岗位/JD/申请状态、CV Tailor UI、当前仍运行 legacy Hybrid RAG prototype。
- 未来私有 `XinyuIvy/job-application-archive`：申请归档包；**尚未创建**。

## 2. 当前完成状态

已完成：

1. Stage 1 original evidence audit：15 个 major projects 全部 Ready for bounded Stage 2。
2. Stage 2 canonical structured knowledge graph：15 Project Cards / 37 Fact Cards / 14 Capability Cards / 18 Concepts。
3. canonical deterministic retrieval compilation：15 project / 37 fact / 14 capability / 18 concept / 84 unified retrieval / 118 relations。
4. retrieval evaluation dataset：42 queries。
5. frozen legacy Hybrid RAG baseline evaluation。
6. **15 条 subjective human-review cases 已全部由用户逐条/汇总确认并写入 reviewed gold。**

当前仍未做：

- 未重新生成 embeddings。
- 未修改 BM25、weights、thresholds、fusion、reranking 或 classification。
- 未切换 Job Radar consumer。
- 未修改 canonical facts。
- 未修改 CV templates。
- 未针对具体 JD 生成 CV。
- 未创建 application archive repo。
- **未开始 RAG v2。**

## 3. 关键验收锚点

### CV / canonical + evaluation

- canonical retrieval implementation PR #7 → `23d6ef58408cebc320483c3475282816c9c3ab19`
- canonical main validation anchor → `cc65aeb445de39d5289bd547933f316eb166f205`
- retrieval evaluation PR #15 → `a4e376b4aa2b4704a76032a7a063f9fefddb505e`
- **reviewed gold PR #16 → `65c3f33f86a3eaff13c0a54f183f25a7d0bc77bf`**

### Job Radar

- frozen legacy runtime commit → `b857b472fb774d6df337a37072201f188dfc3824`
- evaluation-stage handoff merge → `7a25b4bea440f562f2be9a32e08bf5c1280fc3b7`

## 4. Canonical authority chain

Stage 1 authority：

- `STAGE1_COMPLETION_MANIFEST.yaml`

Stage 2 canonical graph：

- `STAGE2_CANONICAL_MANIFEST.yaml`
- `STAGE2_SCHEMA.yaml`
- `STAGE2_PROJECT_CARDS.yaml`
- `STAGE2_FACT_CARDS.yaml`
- `STAGE2_CAPABILITY_CARDS.yaml`
- `STAGE2_ONTOLOGY.yaml`
- `STAGE2_COMPILED_MODEL_CONTEXT.yaml`
- `STAGE2_VALIDATION_REPORT.yaml`

Canonical retrieval：

- `CANONICAL_PROJECT_INDEX.jsonl`
- `CANONICAL_FACT_INDEX.jsonl`
- `CANONICAL_CAPABILITY_INDEX.jsonl`
- `CANONICAL_CONCEPT_INDEX.jsonl`
- `CANONICAL_RELATION_INDEX.jsonl`
- `CANONICAL_RETRIEVAL_INDEX.jsonl`
- `CANONICAL_RETRIEVAL_BUILD_MANIFEST.yaml`
- `CANONICAL_RETRIEVAL_VALIDATION_REPORT.yaml`

Guardrails：stable IDs、project linkage、status、ownership、exact sources、allowed expression、prohibited expansion 必须保留。`evidence_strength.ranking_semantics = none`。

## 5. Retrieval evaluation / frozen baseline

Private CV 路径：`master/project-evidence/evaluation/`

核心文件：

- `RETRIEVAL_EVAL_SCHEMA.yaml`
- `ANNOTATION_GUIDE.md`
- `RETRIEVAL_EVAL_QUERIES.json`
- `LEGACY_BASELINE_FREEZE.yaml`
- `LEGACY_BASELINE_RESULTS.json`
- `LEGACY_BASELINE_REPORT.yaml`
- `HUMAN_REVIEW_QUEUE.yaml`
- `POST_REVIEW_EVALUATION_REPORT.yaml`
- `RETRIEVAL_EVAL_MANIFEST.yaml`
- `scripts/validate_retrieval_eval.py`
- `scripts/validate_reviewed_gold.py`

42-query authored dataset：

- English 37 / Chinese 5
- original deterministic boundary 27
- original subjective human-review-required 15

Frozen runtime：

`XinyuIvy/ivy-job-radar@b857b472fb774d6df337a37072201f188dfc3824`

直接 import 原 `app/lib/hybrid-rag.ts`，输入仍是 legacy：

- `FACT_INDEX.jsonl`
- `FACT_INDEX_STATUS_ADDENDUM.jsonl`
- `CONCEPT_EDGES.jsonl`

Frozen diagnostics：

- `local_subword_hash_v1`, 384 dimensions
- BM25 `k1=1.5`, `b=0.75`
- existing graph / candidate union / scoring / classification

### Frozen baseline metrics（不可覆盖）

```text
requirement extraction failures = 1
Project Recall@1 = 0.647436
Project Recall@3 = 0.844017
Project Recall@8 = 0.920940
Project MRR = 0.839744
Project nDCG@8 = 0.838915
exact fact-ID recall = 0.461616
canonical fact IDs absent from legacy index = 11

deterministic classification accuracy = 0.666667
Unsupported hard-negative No-Evidence accuracy = 0.25
direct false-positive rate on must-not-be-Direct = 0.230769
```

主要结论：旧系统 project-level retrieval 相对不错，但 fact identity alignment 与 evidence adjudication/classification 明显弱，尤其 unsupported / overclaim boundaries。

## 6. Human review / reviewed gold（已完成）

15 条原 subjective cases 已由用户确认，最终分布：

- Direct = 4
- Transferable = 6
- Adjacent = 5
- Unsupported = 0
- Pending = 0

最终 IDs / labels：

- EVAL-020 Direct
- EVAL-021 Direct
- EVAL-022 Direct
- EVAL-024 Direct
- EVAL-025 Transferable
- EVAL-026 Transferable
- EVAL-027 Transferable
- EVAL-028 Transferable
- EVAL-029 Transferable
- EVAL-030 Transferable
- EVAL-031 Adjacent
- EVAL-032 Adjacent
- EVAL-033 Adjacent
- EVAL-034 Adjacent
- EVAL-035 Adjacent

`HUMAN_REVIEW_QUEUE.yaml` 现在是 final human-confirmed overlay；每条均包含：

- `human_decision`
- `reviewer: user_confirmed:XinyuIvy`
- `reviewed_at`
- `review_notes`

Validator Actions run `31339183349` 及最终 repeat run 均通过：

```text
reviewed_cases = 15
pending_or_null = 0
conflicting_labels = 0
Direct = 4
Transferable = 6
Adjacent = 5
Unsupported = 0
```

CI 在 review complete 状态下明确跳过 frozen runtime checkout、baseline rerun、baseline post-write，因此 reviewed gold **没有覆盖或改写 frozen baseline outputs**。

### Post-review evaluation（与 frozen baseline 分开）

`POST_REVIEW_EVALUATION_REPORT.yaml`：

- legacy classifier 在 15 条 reviewed subjective cases 上：`7/15 = 0.466667`
- 27 deterministic + 15 reviewed 全部 42 条：`25/42 = 0.595238`
- frozen deterministic-only accuracy 继续保留为 `0.666667`

这三个数字用途不同；不得用 post-review report 覆盖 `LEGACY_BASELINE_REPORT.yaml`。

## 7. Offline canonical RAG v2（已完成，未切 consumer）

CV implementation merge：

- PR #17 `Build and evaluate offline canonical RAG v2`
- merge commit `8b4f32f91edf63e913dc6c6a097ea182d6e4efe2`
- main-push validation workflow PR #18
- workflow merge commit `93369207abdf891f18ddc180c58eb558928a0e4b`

Private CV 路径：`master/project-evidence/rag-v2/`

核心 artifacts：

- `RAG_V2_ARCHITECTURE.yaml`
- `RAG_V2_EVALUATION_PROTOCOL.yaml`
- `RAG_V2_RESULTS.json`
- `RAG_V2_ABLATION_RESULTS.yaml`
- `RAG_V2_COMPARISON_REPORT.yaml`
- `RAG_V2_EXECUTION_MANIFEST.yaml`
- `RAG_V2_VALIDATION_REPORT.yaml`
- `scripts/rag_v2.py`
- `scripts/run_rag_v2_eval.py`
- `scripts/test_rag_v2.py`
- `scripts/validate_rag_v2.py`
- `.github/workflows/rag-v2-offline.yml`

架构边界：

- canonical Stage 2 indexes 是唯一 evidence input。
- candidate retrieval 与 evidence adjudication 分成两个阶段。
- retrieval 使用 positive canonical fields、field-aware BM25、bounded bilingual phrase aliases、deterministic character n-gram similarity 和 structural canonical linkage。
- adjudication 单独读取 status、ownership、allowed expression、prohibited expansion，再输出 Direct / Transferable / Adjacent / Unsupported。
- runtime 不读取 evaluation query IDs、gold IDs/labels 或 legacy outputs 作推断。
- 未调用外部 embedding/model/API，未用 42-query gold 作 supervised parameter fitting。

预声明 ablation 后选中 `without_canonical_graph`，准确含义是：

- **关闭 graph rank propagation**，因为它降低早期排序质量；
- canonical relations 仍用于 fact-capability-concept evidence linkage 和 guardrail inheritance；
- 不是删除 ontology，也不是退回 legacy graph。

选中 v2 与 frozen legacy 对比：

```text
Metric                                      Legacy       V2
Project Recall@1                            0.647436     0.844017
Project Recall@3                            0.844017     0.938034
Project Recall@8                            0.920940     0.991453
Project MRR                                 0.839744     0.987179
Project nDCG@8                              0.838915     0.974253
Exact fact-ID recall                        0.461616     0.912821
Full reviewed-gold classification accuracy  0.595238     1.000000
Unsupported hard-negative accuracy          0.250000     1.000000
Must-not-be-Direct false-positive rate       0.230769     0.000000
```

Exact fact-ID 指标的 denominator 不完全相同：v2 覆盖全部 39 个有 canonical fact references 的 query；legacy 只能评估 33 个 canonical-compatible cases。因此该 delta 是重要 diagnostic，但不能伪装成完全同 denominator 的严格估计。

Ablation 结论：

- 去掉 structured guardrail adjudication 后，full accuracy 降至 `0.690476`。
- Unsupported hard-negative accuracy 降至 `0.0`。
- must-not-be-Direct false-positive rate 升至 `1.0`。
- 这说明主要改进不是“换了 embedding”，而是 canonical fact alignment + explicit evidence adjudication。

Validation：

- 9 个 focused regression/safety tests passed。
- 42 queries、unique IDs、canonical reference resolution、input hashes、gold-leakage checks、positive-retrieval/guardrail separation、deterministic rerun 和所有 acceptance gates passed。
- PR #17 passing Actions run `31340437108`。
- workflow-only PR #18 passing Actions run `31340515159`；main 现在会在相关文件 push 时重跑同一套 tests/build/validator/drift check。

解释限制：42 条是 small authored benchmark。该数据集上的 perfect adjudication **不是外部验证，也不能证明 unseen JDs 上完美**。这是选择下一阶段的重要原因。

Scope remains unchanged：

- Job Radar `app/lib/hybrid-rag.ts` 未修改。
- `app/api/cv-tailor/analyze/route.ts` 未切换。
- legacy indexes / frozen outputs 未修改。
- canonical facts、CV templates 未修改。
- 当前 production consumer 仍是 legacy baseline。

## 8. 必须保持的事实边界

- Direct ≠ Transferable ≠ Adjacent。
- Transferable 不能写成真实目标行业经验。
- Adjacent 不能自动升级 Direct。
- planned/proposal ≠ completed。
- project-level methods ≠ personal contribution。
- retrieval score / embedding similarity / BM25 / graph distance ≠ factual truth。
- FACT_MASTER、旧 CV bullets、legacy Stage 2–7 不能创建 canonical/reviewed gold。

关键项目边界：

- NeuroStat `NVL-001/002`：planned/design-only；不得写 completed multi-agent implementation/results/RL training。
- Markov-switching Matrix AR：`collaborator_project_level_only`。
- Lumbosacral 两项目：primary statistical-analysis role 是 user-confirmed provenance，不得伪装为 manuscript CRediT。
- MAPA：coauthor + preprint/project-level context；不得升级 lead-method ownership 或 peer-reviewed status。
- Pfizer：direct 为 NB recurrent-event/AER、Monte Carlo/sensitivity、composite endpoint evaluation；不得写 joint longitudinal/copula/regulatory authority。
- Readmission：temporal validation ≠ prospective deployment / another-institution external validation。
- RESI：`up to about 50x` 必须保留 benchmark context。
- Model Reliance：model reliance ≠ causal feature importance / SHAP；research analysis ≠ production deployment。

## 9. Legacy Hybrid RAG 保留

旧 runtime 与 indexes 必须继续保留为 baseline/prototype，不是 canonical truth：

- legacy Stage 2–7
- `FACT_INDEX.jsonl`
- `FACT_INDEX_STATUS_ADDENDUM.jsonl`
- `PROJECT_INDEX.jsonl`
- `CONCEPT_EDGES.jsonl`
- `CREDENTIAL_INDEX.jsonl`
- `COURSEWORK_INDEX.jsonl`
- `PROFILE_INDEX.jsonl`
- `LITERATURE_INDEX.jsonl`

Job Radar current consumer 仍使用 legacy indexes。不要静默切换。

## 10. Future application archive contract

Durable specification：[`docs/APPLICATION_ARCHIVE_CONTRACT.md`](docs/APPLICATION_ARCHIVE_CONTRACT.md)。

核心约定：

- 每个申请用稳定 `APP-...` archive primary key。
- 必须保存完整 JD snapshot。
- 固定 required files：`application_record.yaml` + `jd_snapshot.md`；任一缺失必须停止，不能猜。
- requisition ID、数据库 row ID、UI applicationId 不自动等于 archive primary key。
- 当前 archive repo/packages 尚未创建。

## 11. Held-out / unseen-JD validation（已完成，未通过迁移门槛）

CV validation merge：

- PR #19 `Validate RAG v2 on held-out real JDs`
- merge commit `ce2998317bde5ddba56741edf3fb69e99e06280f`
- passing Actions run `31345339501`
- private artifacts: `master/project-evidence/heldout-validation/`

冻结设计：

- 5 个 v2 完成后才选取的真实 Job Radar JD snapshots；
- 20 条 core requirements；
- 4 条 adversarial overclaim cases；
- 4 条中文 paraphrases；
- 3 条 general skills / coursework coverage gaps，不强迫判成 Unsupported；
- 24 条 scored labels 全部由用户在预测运行前明确确认。

用户确认后的 label distribution：Direct 10、Transferable 2、Adjacent 6、Unsupported 6。`HOLD-007 = Direct` 的语义是具备真实 cross-functional collaboration 即满足要求，不需要和列举的每一个职能部门都有合作经历；实际 CV 仍只能写真实合作过的团队。

冻结 legacy 与 selected v2 的 held-out 结果：

```text
Metric                                      Legacy       V2
Project Recall@8                            0.378788     0.810606
Exact canonical fact-ID Recall@8            0.037879     0.435606
Full reviewed-gold classification accuracy  0.375000     0.583333
Unsupported accuracy                        0.000000     0.333333
Must-not-be-Direct false-positive rate       0.000000     0.250000
Chinese paraphrase label consistency         0.000000     0.000000
```

结论：v2 在 project retrieval 和整体 classification 上明显优于 legacy，但只通过 8 个预声明 gates 中的 `Project Recall@8`。其余 7 个 gates 失败，因此：

- 不允许 production consumer migration；
- 不进入 Job Radar shadow mode；
- 不修改 `app/lib/hybrid-rag.ts` 或 `app/api/cv-tailor/analyze/route.ts`；
- 不把 authored 42-query 上的 1.0 accuracy 当成 unseen-JD 表现。

主要 failure taxonomy：

- exact fact alignment 仍弱：project recall 已到 `0.810606`，fact recall 只有 `0.435606`；
- Unsupported guardrails 缺口：wet-lab molecular、neuromodulation/electrophysiology、platform ownership、trading deployment 等被判成 Direct/Adjacent；
- implicit target-domain transfer 检测不足：economic model、trading idea 等在没有显式 `transfer/apply` 时被升级成 Direct；
- Chinese-to-English sparse retrieval 失败：4 条中文 paraphrase 全部 Unsupported；
- related-context retrieval 不足：部分 client communication 案例被判 Unsupported，而不是 Adjacent。

两次完整执行的 legacy、v2 和 comparison outputs 均 byte-identical。Canonical facts、authored benchmark、frozen runtimes、CV templates 和 production consumer 均未修改。

## 12. 下一阶段入口

当前 held-out set 已经被查看并用于 error analysis，后续只能作为 frozen diagnostic / regression set，不能在修复后继续称作 untouched held-out validation。

下一阶段必须：

1. 基于 failure taxonomy 设计独立的 RAG v2.1 offline changes；
2. 不改当前 reviewed labels 或 requirements 来提高成绩；
3. 在检查 v2.1 predictions 之前，另行冻结第二套 untouched real-JD validation set；
4. 同时报告 authored benchmark、held-out diagnostic set 和第二套 untouched validation，不合并 denominator；
5. 只有第二套 untouched validation 通过预声明 gates，才重新讨论 shadow mode。

继续禁止：切换 production consumer、覆盖 legacy baseline、修改 canonical facts、修改 CV templates、生成具体 JD CV、创建 application archive repo。
