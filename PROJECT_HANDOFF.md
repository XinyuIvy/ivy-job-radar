# Job Application / CV Knowledge Base 项目交接

最后更新：2026-08-09（America/New_York）

> 本文件是新 Chat 的接管入口。开始任何修改前，必须重新读取 `XinyuIvy/CV` 与 `XinyuIvy/ivy-job-radar` 的最新 `main`、branches、recent commits、开放 PR、Actions、相关 handoff/manifest 和可见未提交状态。GitHub 当前状态优先于本文记录的 SHA。不要与另一个 Chat 同时写同一仓库。

## 1. 当前状态摘要

系统分工：

1. `XinyuIvy/CV`：原始证据、canonical cards、ontology、deterministic retrieval artifacts、CV templates。
2. `XinyuIvy/ivy-job-radar`：岗位/JD/申请状态、CV Tailor UI、当前运行中的 Hybrid RAG prototype。
3. `job-application-archive`：未来申请包仓库，尚未创建；当前阶段不要创建。

截至本次 handoff：

- Stage 1 原始证据完整性审计：**完成**。
- 15 个 major projects：**全部 Ready for bounded Stage 2**。
- Stage 2 canonical structured knowledge layer：**完成并验证**。
  - 15 Project Cards
  - 37 Atomic Fact Cards
  - 14 Capability Cards
  - 18 Ontology Concepts
- 下一层 canonical deterministic retrieval/index compilation：**已在 CV PR #5 完成并实际运行 validator**。
  - 15 project records
  - 37 fact records
  - 14 capability records
  - 18 concept records
  - 84 unified retrieval records
  - 118 explicit relation records
- 旧 Stage 2–7、旧 JSONL indexes、旧 `build_fact_index.py`、当前 Job Radar Hybrid RAG 全部保留为 `legacy / prototype / baseline`，未删除、未静默覆盖。
- 本阶段没有重新生成 embeddings，没有修改 RAG scoring/fusion/reranking/classification，没有开始 RAG v2，没有创建 evaluation dataset，没有修改 CV templates，没有针对具体 JD 生成 CV。

### 当前 GitHub 锚点（仅为本次 handoff 记录）

开始本阶段时：

- `XinyuIvy/CV` main：`3326202f88eb6c6a2cb248326522e5ef288e1a54` — `Record Stage 2 validation audits`
- `XinyuIvy/ivy-job-radar` main：`bf6fdbb0fcc5f4c9fb6aeb1416bbf2418ca62afc` — `Document CV evidence and RAG implementation handoff`

为了让 feature PR 能真正执行 GitHub Actions，CV 通过独立 bootstrap PR 合入了一个 workflow：

- CV PR #6：`Bootstrap canonical retrieval validation workflow`
- squash merge commit：`94649367908ab264f3743fbb99a09c615b2d9a76`
- 该 PR **只新增** `.github/workflows/canonical-retrieval-validation.yml`，没有知识库、索引、RAG 或 CV template 内容改动。

本阶段主实现：

- CV branch：`agent/canonical-retrieval-index-20260809`
- CV PR #5：`Compile canonical Stage 2 retrieval indexes`
- 当前 handoff 记录时 feature branch 最近的人工审计 commit：`181a4fcbd9c88945669ae690ad748864336ede6e`
- Job Radar handoff branch：`agent/update-canonical-retrieval-handoff-20260809`

新 Chat 必须重新读取当前 PR head/main；不要把以上 SHA 当永久状态。

## 2. 不能违反的事实边界

知识库最终目的是让新 JD 进入后，系统能够安全区分：

- 真正做过的方法、工具和分析；
- 实际解决的问题；
- 更高层 statistical / analytical concepts；
- 可迁移能力；
- Direct / Strong Transferable / Adjacent / No Evidence；
- 什么可以写进 CV，什么只能解释相关性，什么绝对不能扩大。

硬约束：

- Transferable capability 不能写成真实行业经验。
- Adjacent experience 不能写成 direct experience。
- planned / proposal 内容不能写成 completed。
- project-level method 不能自动变成用户个人贡献。
- `FACT_MASTER.md`、旧 CV bullets、聊天总结、旧 industry translation 都不能创造新事实。
- BM25、hash embedding、graph distance、reranking score 或历史 classification 都不能建立事实真值。
- capability/ontology 节点是 abstraction，不是新证据。
- production deployment、监管申报、client delivery、因果、交易/alpha/backtest、LLM/RL/fine-tuning 等范围必须有直接证据。
- 每个 downstream record 必须保留 ownership、status、source refs、allowed expression 和 prohibited expansion。

## 3. Canonical source-of-truth chain

当前 `XinyuIvy/CV/master/project-evidence/` 的唯一 canonical evidence/card chain：

### Stage 1 — source admission

- `STAGE1_COMPLETION_MANIFEST.yaml`

作用：

- authoritative sources
- supporting sources
- missing/outdated/unclear provenance
- user-confirmed provenance
- project readiness

Stage 1 是事实准入边界。

### Stage 2 — canonical card graph

- `STAGE2_CANONICAL_MANIFEST.yaml`
- `STAGE2_SCHEMA.yaml`
- `STAGE2_PROJECT_CARDS.yaml`
- `STAGE2_FACT_CARDS.yaml`
- `STAGE2_CAPABILITY_CARDS.yaml`
- `STAGE2_ONTOLOGY.yaml`
- `STAGE2_COMPILED_MODEL_CONTEXT.yaml`
- `STAGE2_VALIDATION_REPORT.yaml`
- `scripts/validate_stage2_cards.py`

当前规模：

- projects = 15
- facts = 37
- capabilities = 14
- concepts = 18

Stage 2 validator 检查 project/fact/capability/concept IDs、source admission、planned/project-level leakage、ontology references 和 compiled context coverage。

### Canonical deterministic retrieval compilation

新建：

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

这些新 artifacts 和旧 indexes **并存**。

## 4. Canonical retrieval record contract

每条 project/fact/capability/concept retrieval record 都保留结构化字段：

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

稳定 ID 格式：

```text
project:<project_id>
fact:<fact_id>
capability:<capability_id>
concept:<concept_id>
```

### evidence_strength 的含义

Stage 2 cards 没有一个可合法解释为“概率”的 numerical evidence-confidence scalar，因此新 compiler **没有发明分数**。

使用 non-ranking source/scope labels：

- `canonical_authoritative`
- `canonical_authoritative_plus_user_confirmed`
- `bounded_project_context`
- `bounded_planned_design`
- `canonical_derived`

结构中明确：

```yaml
ranking_semantics: none
```

不能拿这些 label 做 Direct/Transferable/Adjacent scoring。

### retrieval_text 规则

正向 retrieval text 只包含安全的 positive retrieval fields，例如：

- project name/category
- atomic fact claim + project name
- capability name
- concept name

以下 guardrails **保留为结构化字段，不拼进正向 retrieval_text**：

- status
- ownership
- source refs
- evidence strength
- allowed expression
- prohibited expansion

这样检索可以利用事实文本，但 guardrails 不会因为文本拼接而丢失结构。

## 5. Relation index

`CANONICAL_RELATION_INDEX.jsonl` 只编译 canonical graph 中显式存在的关系：

- `project_has_fact`：37
- `fact_supports_capability`：49
- `capability_maps_to_concept`：22
- `concept_has_parent`：10

总数：`118`

relation 只是导航/检索关系，不是新事实，也不允许 materialize transitive relation 后把它当 direct evidence。

## 6. 实际验证结果

`CANONICAL_RETRIEVAL_VALIDATION_REPORT.yaml` 是实际 compiler/validator 运行后生成并提交到 CV PR #5 branch 的结果，不是根据“测试文件存在”推断。

记录数：

```text
project_records = 15
fact_records = 37
capability_records = 14
concept_records = 18
unified_retrieval_records = 84
relation_records = 118
```

relation counts：

```text
project_has_fact = 37
fact_supports_capability = 49
capability_maps_to_concept = 22
concept_has_parent = 10
```

validation report 中以下均为 `passed`：

- schema and required fields
- globally unique record IDs
- project linkage integrity
- exact fact source preservation
- Stage 1 source-admission traceability
- capability support integrity
- ontology reference integrity
- exact relation-set validation
- guardrail field preservation
- no guardrail flattening into retrieval text
- prohibited-overclaim boundary
- deterministic repeatability
- compiled-content drift

scope report：

```text
embeddings_regenerated = false
hybrid_rag_scoring_changed = false
consumer_switched = false
cv_templates_modified = false
evaluation_dataset_created = false
```

`CANONICAL_RETRIEVAL_BUILD_MANIFEST.yaml` 还保存：

- 9 个 canonical input 的 SHA-256
- 6 个生成 JSONL 的 SHA-256
- record/relation counts
- `legacy_baseline_preserved: true`
- `consumer_switched: false`

## 7. 重点 guardrails 仍然成立

### NeuroStat

Canonical facts 只有：

- `NVL-001`
- `NVL-002`

都是 `planned` / `project_lead_planned_design_only`。

可以写：设计了 single/two/four-agent workflow 和 blinded evaluation plan。

不能写：two/four-agent 已实现、已评估、已经更优、已有 reviewer score、做过 PPO/DPO/GRPO/RL training/fine-tuning。

旧 `FACT_INDEX_STATUS_ADDENDUM.jsonl` 中的 `NSVL-007`（single-agent baseline in progress）是 **legacy runtime addendum**，不在当前 37 canonical Fact Cards 中，新 compiler 不导入它。

### Markov-switching Matrix AR

Canonical ownership：`collaborator_project_level_only`。

可以描述参与了 Markov-switching matrix autoregression / matrix-normal likelihood / EM-style estimation 项目。

当前 canonical Stage 1/2 不足以把旧 derived personal matrix-derivative/R-code claim 自动升级为个人事实。

### Lumbosacral 两项目

用户明确确认：主要负责全部统计分析 + manuscript statistical sections review。

必须保留 `user_confirmed` provenance；不能写成 manuscript CRediT statement，也不能扩大到 acquisition/preprocessing/sequence development/study conception。

### MAPA / correlation accuracy

Canonical 只允许：coauthor + preprint/project context。

必须保留 `preprint_not_peer_reviewed` 边界；不能自动说用户发明方法或 lead analysis。

### Pfizer

Direct admitted evidence：negative-binomial recurrent-event/AER、Monte Carlo、sensitivity、composite-endpoint evaluation。

不能写 joint longitudinal model 或 copula implementation，不能扩大监管 authority。

### Readmission

是 temporal validation，不是 prospective deployment，不是 another-institution external validation。

### RESI

“up to about 50x faster” 必须保留 benchmark-specific 限定。

### Model Reliance

不能把 model reliance 写成 causal feature importance，也不能假称 published/production deployment。

## 8. Legacy / prototype 文件必须保留

以下是历史基线，**不是当前 canonical evidence source**：

- `STAGE2_EVIDENCE_MAP.yaml`
- `STAGE3_ATOMIC_FACTS.yaml`
- `STAGE3_COLLABORATIVE_ADDENDUM.yaml`
- old Stage 4 addenda/layers
- old Stage 5 industry translations
- old Stage 6 graph
- old Stage 7 matching specs
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

`STAGE1_RAG_BASELINE.yaml` 是 baseline preservation inventory。

README 与 `CONTENT_FREEZE_MANIFEST.yaml` 已在 CV PR #5 修正：不再把旧 Stage 3–7 称作 canonical。

## 9. 旧 build pipeline 的依赖问题

旧 `FACT_INDEX_BUILD_SPEC.yaml` 明确把以下作为 source layers：

- Stage 2 evidence map
- Stage 3 atomic facts
- Stage 4 capability layers
- Stage 5 industry translations
- Stage 6 concept graph

旧 `scripts/build_fact_index.py` 也直接读取/连接这些文件。

因此它只能继续当 legacy compiler；**不要改它来偷偷生成新 canonical index，也不要覆盖旧 JSONL**。

新 compiler `build_canonical_retrieval.py` 只读取用户指定的 9 个 canonical files。

## 10. 当前 Ivy Job Radar 仍然消费旧 indexes

截至本次审计，`ivy-job-radar/app/api/cv-tailor/analyze/route.ts` 仍明确读取：

- `FACT_INDEX.jsonl`
- `FACT_INDEX_STATUS_ADDENDUM.jsonl`
- `CONCEPT_EDGES.jsonl`
- `CREDENTIAL_INDEX.jsonl`
- `COURSEWORK_INDEX.jsonl`
- `PROFILE_INDEX.jsonl`
- `LITERATURE_INDEX.jsonl`

`app/lib/hybrid-rag.ts` 仍使用旧 `FactIndexRecord` / `ConceptEdge` schema 和现有 scoring/classification。

**本阶段没有切换 consumer。**

这是有意的：新 canonical indexes 已完成 deterministic compilation，但 consumer integration 必须单独设计，避免一边换 source schema 一边改变 retrieval behavior，导致无法区分 regression 来源。

## 11. 现有 Hybrid RAG 的技术历史（面试可用）

下面保留旧 handoff 中最重要的 RAG 演进，后续不要删除，因为用户会用它准备面试。

### Legacy：FACT_MASTER + alias overlap

最早流程：

```text
完整 JD
-> predefined requirement / alias detection
-> 读取 FACT_MASTER
-> 按 project section 切开
-> literal alias / keyword overlap
-> 找匹配 lines
-> covered / supported_gap / unsupported_gap
```

没有 vector semantic retrieval、BM25、concept graph 或真正 reranking。

### Structured knowledge contract

后来加入 knowledge schema/UI/private repo reader，但 retrieval 仍是手工加权词重叠：

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

### Evidence-grounded atomic facts

随后从 FACT_MASTER 转到带有：

- fact_id
- status
- personal attribution
- evidence strength
- source/location
- claim boundary

的 structured fact layer，并开始区分 Direct / Transferable / Adjacent。

### 第一版 Hybrid RAG

加入：

1. exact/direct overlap
2. BM25
3. local dense hashing channel
4. concept graph expansion
5. industry translation overlap
6. preverification score
7. status/ownership/scope/overclaim guardrails

这才是第一版真正运行的 Hybrid RAG prototype。

### Structured profile evidence

学历、课程、skills、论文、service、awards 后来分离：

- named degree/field 先走 deterministic credential match
- coursework 只能 `Coursework Match`
- coursework 不能单独升级成 professional implementation
- publication status 分 published / under review / preprint

### Fact corpus 与 CV template corpus 分离

后来把两个问题拆开：

- FACT_INDEX：用户有没有证据？
- CV template index：当前简历已经写了没有？

避免“事实存在”和“CV 已覆盖”混成同一个语义匹配问题。

### JD atomic requirement expansion

Alibaba 等案例推动了 requirement 原子化：RL/PPO/DPO/GRPO/reward design/training stability/tool calling/code execution 等拆开，并对 named methods/tools 使用 exact-evidence ceiling。

## 12. 当前 Hybrid RAG 精确实现

### Tokenization

- Unicode NFKC
- lower-case
- dash/underscore/slash → spaces
- 小型 English stop-word removal
- 简单 stemming：`collaborat*`、`-ing`、`-ed`、复数 `-s`
- Chinese：连续汉字 block 生成 overlapping character bigrams

set similarity：

```text
overlap_count / sqrt(|left| * |right|)
```

### Dense channel 不是 neural embedding

名称可理解为 `local_subword_hash_v1`：

- 维度：384
- features：tokens + character trigrams
- hash：FNV-1a 32-bit
- bucket：`hash % 384`
- sign：hash 最低位决定 +1 / -1
- L2 normalize
- cosine = dot product，负值截 0

公式：

```text
v[h(f) mod 384] += sign(h(f))
v <- v / ||v||2
similarity(q,d) = max(0, q^T d)
```

面试必须说：

> Implemented a deterministic 384-dimensional signed subword-hashing retrieval channel for a serverless prototype; it was not a pretrained neural embedding model.

不要说使用 OpenAI embeddings、Sentence-BERT、BGE、E5；仓库没有证据。

### BM25

- `k1 = 1.5`
- `b = 0.75`

IDF：

```text
log(1 + (N - df + 0.5) / (df + 0.5))
```

### Concept graph

- 最多约 2 hops
- path score = edge weights 连乘
- adjacent path 不能通过后续 transferable edge 人为升级
- graph 只能做 semantic expansion，不能提升 ownership/status/evidence truth

### 旧 preverification weighting

历史实现的主要权重：

| Component | Weight |
|---|---:|
| exact method / direct overlap | 24 |
| statistical concept similarity | 16 |
| problem-solved similarity | 22 |
| industry functional similarity | 12 |
| evidence strength | 10 |
| personal attribution | 10 |
| status readiness | 6 |

历史阈值/规则是 heuristic/regression-tuned，不是从人工标注数据学习的概率模型。

### 旧 classification 边界

历史实现大致使用：

- Direct：强 direct overlap + cv eligible + 无 scope conflict
- Strong Transferable：一定 preverification 分数 + problem/industry/graph support
- Adjacent：低阈值 semantic/graph/BM25 候选
- embedding-only 不允许 Direct/Strong Transferable
- named method/tool 无 exact evidence → No Evidence
- `project_context` → No Evidence
- planned/in-progress → 不能生成 completed wording

这些是 **baseline behavior**，不是事实 authority。

## 13. 为什么旧 RAG 效果不好

主要原因不是单纯“embedding 太差”，而是多层问题叠加：

1. 早期 source corpus 没有先完成 authoritative-source audit。
2. retrieval similarity 和 evidence adjudication 被混在一起。
3. 384-d hashing 只编码词/字符片段相似，不理解完成状态、ownership、否定、scope。
4. hand-written aliases 对已知 JD 有效，但泛化有限。
5. requirement 过度按标点/连接词拆分会丢上下文。
6. local top-k retrieval 无法完成整份两页 CV 的全局项目组合决策。
7. 24/16/22/... 和 0.78/42/... 等阈值没有 gold set 校准。
8. concept graph 可以建立合理“相关性”，但不能创造事实。
9. runtime 曾承担过多 classification/recommendation，而理想分工应是 RAG 找证据、全局模型做语义裁决和 CV 选择。

## 14. 后续 RAG 改进原则

不要直接“把 384 换成更大的 embedding”就叫 RAG v2。

正确顺序：

1. authoritative evidence → canonical cards（已完成）
2. deterministic canonical retrieval/index layer（本次已完成）
3. **单独建立 evaluation dataset**（用户明确要求本阶段之后再做）
4. 保存 legacy baseline outputs
5. 在 gold set 上比较 semantic embedding / field-aware indexing / fusion / reranking
6. 再设计 controlled consumer integration / RAG v2

未来 evaluation 指标至少应考虑：

- Recall@k
- MRR / nDCG
- classification precision/recall
- Direct false-positive rate
- overclaim rate
- evidence citation accuracy
- project-selection agreement

未来可评估真正 multilingual semantic embedding、bi-encoder + reranker、field-aware multi-vector indexing、LLM-assisted structured requirement extraction，但必须在 benchmark 上比较，不能先假定更复杂模型一定更好。

## 15. 本次 canonical compilation 的剩余风险

### 15.1 Runtime 尚未切换

Job Radar 仍读 legacy indexes。新 `CANONICAL_*` artifacts 当前是经过验证的 **source/index layer**，不是 runtime replacement。

### 15.2 Non-project evidence 尚未 canonical reconcile

本阶段用户指定的 canonical inputs 只包含 Stage 1 + Stage 2 project/fact/capability/ontology graph。

因此 credentials/coursework/profile/literature 没有被偷偷导入新 canonical graph；旧 structured indexes 继续保留。

后续若要统一，应单独定义 non-project canonical schema/source admission，而不是把 legacy records直接混进来。

### 15.3 evidence_strength 是 scope descriptor，不是 confidence score

不能把新 label 当 ranking feature，除非后续明确设计并验证。

### 15.4 没有 dedicated committed query log

Stage 1 和本次 audit 都没有找到专门 committed RAG query-log artifact；不要编造。

### 15.5 本地未提交并发不可完全观测

GitHub 能证明远端 commit/PR 状态，但不能看到另一个 Chat/电脑尚未 push 的 local worktree。因此后续仍必须先重新查最新远端状态，并避免并行写同一 branch/repo。

## 16. 下一阶段入口

本次任务完成后停止，不要顺手开始 RAG v2。

用户已经明确：**evaluation dataset 要在本阶段完成后单独做。**

因此推荐下一阶段是：

### Stage: RAG Evaluation Dataset / Baseline Evaluation

开始前：

1. 确认 CV PR #5 当前状态/是否已合并。
2. 重新运行 canonical retrieval validator。
3. 保存当前 Job Radar legacy RAG 作为 baseline，不改 scoring。
4. 设计真实 JD → atomic requirement → relevant fact IDs → expected classification/guardrail 的 gold schema。
5. 先建立小而高质量的中英文、多行业人工标注集。
6. 评估 legacy runtime 与未来 canonical consumer adapter 的 retrieval/overclaim 表现。

在 evaluation dataset 建立之前：

- 不重新训练/换 embedding
- 不调 heuristic thresholds
- 不开始 RAG v2
- 不让 Job Radar 静默改读新 artifacts

后续另一个独立阶段才是 **canonical consumer integration**：让 Job Radar 读取 `CANONICAL_*`，但需要清楚设计 compatibility adapter，并保证更换 source schema 和更换 scoring algorithm 不在同一次改动中发生。

## 17. Job Radar 非 RAG 状态（避免重复修）

已完成/已有：

- 多源岗位收集与申请状态管理
- 中国/美国入口
- 取消工资自动排除
- hard requirement mismatch 不进入 negative preference learning
- Chrome bookmark save → 准备材料
- optimistic pending insertion / reconcile
- 收藏/核验后的即时列表更新改进
- CV Knowledge Base 页面和 private CV repo reader

仍可能需要未来继续：

- application status transitions 统一 shared-state workflow
- delete/rollback/undo 一致化
- public repo 历史隐私审计
- Site 部署同步
- application archive 端到端流程

这些不是当前 canonical retrieval compilation 阶段任务。

## 18. 安全与操作规则

- `XinyuIvy/CV` 是 private。
- `ivy-job-radar` 当前 public。
- `CV_GITHUB_TOKEN` 不得写进代码、聊天、README、PR、日志。
- private evidence 不得复制到 public repo。
- 不要声称 CI/test 通过，除非实际执行或有可核验 execution artifact/report。
- 不要从测试文件存在推断历史 CI 成功。
- 不要直接写 main；使用独立 branch + PR。
- 不要同时修改 CV template，除非用户进入模板阶段。
- 不要创建 application archive repo，除非用户明确授权。

## 19. 新 Chat 推荐开场指令

```text
继续 XinyuIvy/CV 的 Job Application / CV Knowledge Base 项目。先完整读取 XinyuIvy/ivy-job-radar/PROJECT_HANDOFF.md，并重新检查两个仓库当前 main、branches、PR、Actions 和可见并发状态。

Stage 1 和 Stage 2 canonical card graph 已完成；canonical deterministic retrieval compilation 已在 CV PR #5 建立并验证。旧 Stage 2–7、FACT_INDEX/CONCEPT_EDGES/build_fact_index.py 和当前 Job Radar Hybrid RAG 都是 preserved legacy/prototype baseline，不是 canonical evidence source。

下一阶段不要直接做 RAG v2。先按用户新的明确指令决定是建立 RAG evaluation dataset，还是做单独的 canonical consumer integration。任何情况下都不要重新生成 embeddings、不要用旧 retrieval score 证明事实、不要修改 CV templates 或针对具体 JD 生成 CV，除非用户另行授权。
```
