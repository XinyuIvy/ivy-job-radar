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

## 7. 必须保持的事实边界

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

## 8. Legacy Hybrid RAG 保留

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

## 9. Future application archive contract

Durable specification：[`docs/APPLICATION_ARCHIVE_CONTRACT.md`](docs/APPLICATION_ARCHIVE_CONTRACT.md)。

核心约定：

- 每个申请用稳定 `APP-...` archive primary key。
- 必须保存完整 JD snapshot。
- 固定 required files：`application_record.yaml` + `jd_snapshot.md`；任一缺失必须停止，不能猜。
- requisition ID、数据库 row ID、UI applicationId 不自动等于 archive primary key。
- 当前 archive repo/packages 尚未创建。

## 10. 下一阶段入口

**到本 handoff 为止停止。不要自动开始 RAG v2。**

如果未来用户明确开启 RAG v2，必须以以下两套结果作为不可变比较基准：

1. frozen deterministic baseline：27 deterministic cases；
2. reviewed subjective-label evaluation：15 user-confirmed cases + full 42-case report。

未来 RAG v2 可以针对 requirement extraction、canonical fact alignment、field-aware retrieval、semantic embeddings、fusion/reranking、evidence adjudication、overclaim guardrails 提出新设计，但任何改动必须另开 branch/PR，并与上述 frozen/reviewed reports 比较。

在用户另行授权前继续禁止：重新生成 embeddings、调 legacy scoring、切 consumer、修改 CV templates、生成具体 JD CV、创建 application archive repo。
