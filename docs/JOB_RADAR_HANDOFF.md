# Ivy Job Radar Handoff

Last updated: 2026-08-08

This document is the canonical handoff for continuing the current Ivy Job Radar / CV knowledge-base work in a new ChatGPT conversation. It intentionally consolidates decisions from the latest development chat, corrects older “not done yet” notes that are now complete, and separates truly unfinished work from historical issues that have already been resolved.

## 1. Project identity and repositories

Primary application repo:

- `XinyuIvy/ivy-job-radar`
- The repo is currently PUBLIC.
- Live ChatGPT Site: `https://ivy-job-radar.rourou1199.chatgpt.site`
- Site slug: `ivy-job-radar`
- Site deployment is NOT automatically tied to GitHub. After a new main commit is merged, the user usually goes to a separate ChatGPT Site editing chat and manually asks it to sync that commit SHA.

Private CV / evidence repo:

- `XinyuIvy/CV`
- This remains private.
- Ivy Job Radar reads private CV sources using the server-side environment variable `CV_GITHUB_TOKEN`.
- The token value must NEVER be placed in source, chat, README, PR body, logs, or public repo files.
- Merely exposing the variable name `CV_GITHUB_TOKEN` or the private repo name does not expose the token or private contents.

Operational feature baseline immediately before this handoff update:

- Latest merged Job Radar feature commit: `4e55da0b59fbae4a29af68efa16b625a595f9f16`
- That commit added the CV Knowledge Base infrastructure described below.

## 2. Product direction and user interaction philosophy

The user no longer wants the site to behave like a slow, server-rendered dashboard where every action waits for all database/API fields and then requires a browser refresh.

The desired interaction model is:

1. User clicks an action.
2. The visible UI changes immediately.
3. The backend/database write happens in the background.
4. Slow details such as JD text, verification evidence, metadata, company research, etc. may arrive later.
5. If persistence fails, the UI should roll back or visibly indicate failure.

This is the preferred architecture for future work and is more important than adding generic page-level refresh buttons.

Examples of desired behavior:

- Click “收藏” in 今日岗位 -> card disappears immediately, following cards move up, 收藏 count changes, 收藏 page can show at least company + title immediately.
- Manual Chrome save -> pending application appears at the top immediately; detailed JD can synchronize later.
- Human verification approval -> queue card disappears immediately; the approved job can appear in 今日岗位 as a lightweight placeholder before all details are loaded.
- Status transition -> move the application immediately between pending / submitted / interview / offer / rejected buckets.

Use shared React state and optimistic UI whenever possible. Avoid `window.location.reload()` for normal workflow actions.

## 3. Current navigation and application semantics

Main views currently include:

- 今日岗位
- 收藏与待提交
- 申请进度
- 公司研究与面经
- 岗位核验
- 个人资料
- 不再推荐

Application statuses include:

- 准备材料
- 已申请
- 一面
- 二面/技术面
- 终面
- Offer
- 撤回
- 拒绝

“待提交申请” corresponds to application status `准备材料`.

User preference / screening semantics:

- Salary screening has been completely removed.
- The system should not reject a role just because words such as deep learning, reinforcement learning, or deployment appear in a JD.
- User does not target software engineering / algorithm engineering / front-end / back-end roles.
- User does not target GenAI / LLM / NLP roles, but simple keyword occurrence alone must not cause exclusion.
- Relevant directions include statistics / biostatistics / data science / ML / applied AI / healthcare AI / medical device / quant / healthcare consulting.

## 4. Verification queue semantics

There is one user-facing verification queue. Internally there are ordinary user-submitted verification records and data-quality issues, but do not describe the UI as “manual vs automatic queues.”

For a record requiring human review, the intended actions are:

- 人工通过
- 重新核验
- 不再推荐
- 仅删除记录

Hard-requirement exclusion semantics are separate from preference learning.

Hard requirement reasons include:

- 经验年限或职级不符合
- 学历或专业要求不符合
- 工作授权或 sponsorship 不符合
- 地点或工作方式不符合
- 必备技能、证书或语言不符合
- 其他硬性条件不符合

Important rule:

- `hard_requirement_mismatch` excludes the current job only.
- It must NOT generate negative role/keyword preference learning.

## 5. Completed work: navigation persistence and interaction speed

The following older “unfinished” items are now complete and should NOT be presented as outstanding work.

### 5.1 Hard-requirement exclusion behavior: COMPLETE

Merged previously in PR #44.

Commit:

- `5f295d7cd0adb9a78e0db5d86195f6bd2e620502`

Implemented differentiated reasons:

- 岗位已关闭或链接失效
- 岗位方向不感兴趣
- 硬性要求不符合

Only genuine preference rejection is eligible for negative preference learning.

### 5.2 Navigation state persistence: COMPLETE

Merged in PR #45.

Commit:

- `8be36a4c350c518f0dd059974fc91dfbb9810f2a`

The site preserves current view, filters, search, and scroll in session state instead of losing user context on every navigation event.

### 5.3 Job-data cache: COMPLETE as a first pass

Merged in PR #46.

Commit:

- `6cc3391c0e49018aa98703f56e8565f1fa8a07a4`

A short-lived session cache for `/api/jobs` was added. This reduced some repeated job-list loading but did not by itself solve all cold-refresh latency.

### 5.4 Manual Chrome save directly to pending application: COMPLETE

Merged in PR #47.

Commit:

- `c21f28d54f7923184a7d085065c2956e8c18d446`

Current intended behavior:

- Chrome bookmark save bypasses verification.
- It directly creates a pending application with status `准备材料`.
- Each save uses an independent capture popup so rapid consecutive saves do not overwrite one another.

Important legacy note:

- Chrome bookmarklets store JavaScript at install time. If a device still has an old bookmarklet installed from before these fixes, it may need to be reinstalled after the Site is synced.

### 5.5 Live pending-application insertion: COMPLETE

PR #48 initially added real-time insertion.

Commit:

- `fa0ad50f4a431dd354efd09a8c8ebed2c65ebfd5`

PR #49 made the cross-window synchronization more reliable.

Commit:

- `99065222c29ea4faaa1f2cc4c317f8a4f0c69d7c`

It added:

- BroadcastChannel
- localStorage storage-event fallback
- server reconciliation from `/api/applications`
- focus / visibility reconciliation
- no forced browser reload

### 5.6 Correct target for new pending cards: COMPLETE

PR #50 fixed a placement bug where the new record was being inserted into the summary-card area instead of the formal pending list.

Commit:

- `91d3fbfb4f238e7f8b1ec6efe35cef8550cfdb45`

Current intended behavior:

- The top “收藏 / 待提交申请” summary cards do not receive inserted job cards.
- New pending applications appear as the first card in the formal `我的待提交申请` list.
- Existing records move down.
- No forced scroll.

### 5.7 Pending summary count live update: COMPLETE

PR #51.

Commit:

- `581a7c17d5d8fa52f5927b0d86a38dd5f661ebe3`

After a manual save:

- the pending list updates immediately;
- the `待提交申请` summary number also updates immediately;
- the value later reconciles against `/api/applications` so duplicate events do not permanently inflate the count.

### 5.8 Core optimistic dashboard actions: COMPLETE as first phase

PR #52.

Commit:

- `c98e3c46e690c7bc018dfedecd7662a3346d3afa`

CI on the final PR head passed:

- Python tests: success
- app lint: success
- app build: success

Implemented first-phase optimistic behavior:

- Saving from 今日岗位 immediately hides the card so following jobs move up.
- React’s saved state makes the job available in 收藏 without waiting for a full reload.
- Failed save can restore the hidden card.
- Ordinary ignore actions hide a job immediately and reconcile against the server.
- Human verification approval no longer forces a full-page reload.
- The verification card disappears immediately.
- An approved job can surface as a lightweight placeholder in 今日岗位 while detailed job data finishes syncing.

This is the preferred pattern for extending all other workflow transitions.

## 6. Still unfinished: optimistic workflow expansion

The first phase is done, but not every transition has been converted to the new instant model.

Future work should continue the same pattern for:

- “加入申请追踪” / create pending application from a normal job card
- pending -> submitted
- submitted -> interview
- interview -> offer
- any stage -> rejected / withdrawn
- delete / undo where appropriate
- potentially company-research and contact workflows if their current interactions still block on full reloads

The user explicitly preferred this optimistic architecture over adding generic “刷新本页” buttons everywhere.

Page-level refresh functions were discussed but NOT implemented as a major feature. They are now lower priority unless a specific stale-data problem remains after optimistic state updates are expanded.

## 7. CV tailoring: current behavior

The current CV tailoring workflow is analysis-oriented. Do not reintroduce editing/export/LaTeX/automatic PR-generation controls unless the user explicitly asks.

The private CV repo is read using the authenticated GitHub Contents API.

Current CV analysis historically did this:

1. Read the relevant template CV from the private `XinyuIvy/CV` repo.
2. Read all of `master/FACT_MASTER.md`.
3. Detect a predefined set of JD requirements using aliases / keyword groups.
4. Split FACT_MASTER into project sections.
5. Find matching fact lines using rule-based keyword overlap.
6. Classify template coverage and fact support.

This is NOT a true embedding/vector RAG system.

The old logic is best described as:

- full FACT_MASTER read
- alias / keyword matching
- section-level filtering
- direct fact extraction

The limitation is semantic recall across industries. A statistical term can correspond to a different business-language capability without sharing the same literal words.

Example discussed:

- academic: confidence sets for model reliance / variable importance
- statistical concept: uncertainty quantification, simultaneous inference, model dependence
- Tech interpretation: model interpretability, robust feature importance, uncertainty-aware model evaluation
- Quant interpretation: signal relevance, factor relevance, model uncertainty, sensitivity to model specification

The system must distinguish “transferable capability” from “industry experience.” It must never turn a valid statistical transfer into an unsupported claim such as “developed alpha signals” if no financial signal work was performed.

## 8. Desired future CV matching architecture

The long-term target is a fact-grounded Hybrid RAG system, not pure embedding retrieval.

Desired pipeline:

```text
JD
-> requirement extraction
-> exact method / skill matching
   + semantic retrieval
   + concept-graph expansion
-> candidate atomic facts
-> reranking
-> factual verification
-> translation confidence
-> CV recommendation
```

Reranking should consider at least:

- exact method overlap
- statistical-concept similarity
- problem-solved similarity
- industry functional similarity
- evidence strength
- prohibited-overclaim constraints

Embedding similarity must never be the sole source of truth.

Recommended translation-confidence classes:

- Direct Match
- Strong Transferable Match
- Adjacent Match
- No Evidence

Every industry translation should ultimately point back to an original verified fact / source evidence.

## 9. CV Knowledge Base infrastructure: COMPLETE as first version

PR #53 added the Job Radar side of the future knowledge-base system.

Merged feature commit:

- `4e55da0b59fbae4a29af68efa16b625a595f9f16`

Final CI passed:

- Python tests: success
- app build: success
- app lint: success

The site now has a CV Knowledge Base area and backend retrieval interface.

The site expects these future machine-readable files in the private CV repo:

```text
knowledge/FACT_INDEX.json
knowledge/CAPABILITY_ONTOLOGY.json
knowledge/INDUSTRY_TRANSLATION_MAP.json
```

A schema / contract document was added in the Job Radar repo:

```text
docs/CV_KNOWLEDGE_SCHEMA.md
```

The knowledge-base page can show:

- whether structured files exist
- atomic fact count
- project count
- concept count
- transferable-capability count
- translation counts by industry
- sync/readiness state

It also provides a JD evidence-retrieval test surface.

Current retrieval considers structured layers such as:

- exact methods
- statistical concepts
- problems solved
- transferable capabilities
- domains
- industry translation
- verified fact
- evidence strength
- prohibited overclaims

Important: actual embedding/vector semantic RAG is NOT implemented yet. Current structured retrieval is a first stage. The schema and UI were intentionally designed so semantic/vector retrieval and reranking can be added later without redesigning the page.

Missing structured files currently fail gracefully. Existing FACT_MASTER-based CV analysis remains usable while the evidence knowledge base is being constructed.

## 10. Evidence knowledge-base project: current status

The user is separately building the primary-evidence archive that will feed the structured knowledge base.

Current status supplied by the user at the end of this chat:

- Stage 1 inventory is complete.
- The main GitHub archive structure is largely complete.
- Stage 1 archive completeness audit and gap-filling are NOT finished.
- Stage 2 per-project Evidence Map has NOT started.

Therefore the next evidence-work step is NOT “start industry translation.”

The correct next step is to close Stage 1 first.

Stage 1 completion should include a per-project manifest with at least:

- Project
- Primary evidence present?
- Missing evidence?
- Authoritative source(s)
- Ready for Stage 2?

The authoritative-evidence priority is:

Primary / strongest evidence:

- manuscript / paper
- supplement
- thesis / dissertation materials
- project proposal
- internship project documentation
- code / README that directly proves what was implemented

Secondary evidence:

- slides
- research notes
- project summary
- reviewer response

Tertiary evidence:

- FACT_MASTER
- CV bullets
- previous chat summaries

Tertiary evidence may help locate sources but should not be the sole basis for a new transferable-capability claim when stronger source material exists.

Recommended Stage 2 order once projects are marked Ready:

1. Semiparametric Confidence Sets
2. RESI asymptotic inference
3. Model Reliance / Variable Importance Confidence Sets
4. Pfizer internship
5. Multimodal / distance inference
6. EHR readmission
7. remaining collaborative / software projects

## 11. Intended knowledge records from Stage 2+

The evidence project should eventually produce atomic facts similar to:

```json
{
  "fact_id": "...",
  "project": "...",
  "verified_fact": "...",
  "exact_methods": [],
  "statistical_concepts": [],
  "problems_solved": [],
  "transferable_capabilities": [],
  "domains": [],
  "industry_translation": {
    "tech": [],
    "quant": [],
    "pharma": [],
    "consulting": []
  },
  "prohibited_overclaims": [],
  "evidence_strength": "high|medium|low",
  "source_evidence": {}
}
```

The key conceptual separation is:

- original verified fact
- exact method/tool
- statistical / analytical concept
- problem solved
- transferable capability
- industry translation
- prohibited overclaim

Do not collapse these into one synonym list.

The concept graph should distinguish relation types such as:

- exact synonym
- statistical parent concept
- statistical child concept
- functional equivalent
- transferable industry interpretation
- adjacent concept

## 12. Public-repo privacy state

The user recently made `XinyuIvy/ivy-job-radar` public and asked whether personal data / Excel files were exposed.

What was already checked in the earlier chat:

- code search did not find `.xlsx` files in the current indexed repo state;
- code search did not find obvious `.csv` database exports in the current indexed repo state;
- Job Radar operational records are primarily stored in the Site / Cloudflare database rather than as Excel files committed to the repo;
- `CV_GITHUB_TOKEN` is read from environment, not hardcoded in the observed source;
- private CV content is not automatically exposed just because the public repo contains the private repo name or environment-variable name.

However, this privacy audit is NOT fully complete.

Important outstanding privacy work:

- audit older commit history and historical PR diffs for previously committed sensitive files;
- inspect `.env`, token, API key, cookie/session/credentials patterns across history;
- inspect historical exports (`xlsx`, `xls`, `csv`, `db`, `sqlite`, `sqlite3`);
- inspect accidental personal-information snapshots;
- inspect whether a strict `.gitignore` is already present and add missing patterns if needed;
- if a real secret was ever committed, rotating the secret is required; `.gitignore` alone does not erase Git history.

Suggested `.gitignore` protection if not already covered:

```gitignore
# Private user data
*.xlsx
*.xls
*.csv
*.db
*.sqlite
*.sqlite3

# Secrets
.env
.env.*
!.env.example

# Private exports / snapshots
data/private/
private/
exports/
snapshots/
local-data/
secrets/

# Local credentials / sessions
*.cookie
cookies.json
session.json
credentials.json
```

Do not claim the public repo is fully privacy-audited until history is actually checked.

## 13. Job-search automation / scanning state relevant to continuation

The old ChatGPT automation that automatically triggered daily searching at 6 AM was disabled.

Current automation ID from prior work:

- `6a6bc726c63c8191b2680674ba5ec87a`
- `is_enabled: false`

The product strategy is manual / on-demand scan control rather than automatic daily triggering.

Historical scan sources include:

- Greenhouse
- Lever
- Ashby
- BambooHR
- iCIMS
- Paylocity
- Workday
- JobSpy / LinkedIn
- company career portals
- China sources including BOSS, Liepin, Niuke, public index / company sites

BOSS has previously hit environment / verification limitations and should not be described as perfectly stable.

## 14. CV tailoring facts that should remain stable in continuation

Target CV families:

- Pharma / Biostatistics
- Tech / Data Science / ML / Applied AI Scientist
- Quant Research
- Healthcare / Life Sciences Consulting

User does not want fabricated domain experience just to hit ATS keywords.

The intended JD-to-CV process remains:

1. Read the JD.
2. Extract requirements and keywords.
3. Retrieve verified personal evidence.
4. Distinguish exact match vs transferable match vs adjacent vs unsupported.
5. Compare with the industry template.
6. Recommend project / wording changes.
7. Preserve factual boundaries.

The knowledge-base project is meant to improve step 3 and step 4, especially where academic statistical language and industry language differ.

## 15. Important implementation caution

There are now several helper/client layers mounted from `app/layout.tsx`, including historical modules for:

- verification queue actions
- pending-job visibility
- pending-application live sync
- optimistic dashboard actions
- CV application actions
- hard-requirement ignore actions
- navigation-state persistence

Some of these modules were added incrementally before the core `job-radar.tsx` state was fully refactored.

Future work should gradually move critical state transitions into first-class React/shared state rather than adding unlimited DOM observers or imperative patches. The user values speed, but long-term maintainability matters.

In particular:

- the pending live-sync system works and should not be casually removed;
- however, the eventual clean architecture should let `applicationsList`, `saved`, `dailyJobs`, etc. be updated directly by shared events/state so the summary numbers and lists remain naturally consistent.

## 16. What the next chat should do first

If the user wants to continue the evidence / Hybrid RAG work:

1. Do not start Stage 2 until the user confirms Stage 1 completeness audit is closed, or until a specific project is explicitly marked Ready for Stage 2.
2. Review the Stage 1 completion manifest.
3. Start Evidence Map work project-by-project from authoritative primary sources.
4. Convert approved evidence into atomic facts conforming to `docs/CV_KNOWLEDGE_SCHEMA.md`.
5. Populate the private CV repo knowledge files.
6. Once sufficient facts exist, test the existing `/cv-knowledge` retrieval interface with real JDs.
7. Then add semantic embeddings/vector retrieval + reranking on top of the existing structured retrieval.

If the user wants to continue Job Radar UX work:

1. Extend optimistic transitions to application-status flows.
2. Prefer shared React state over page reloads.
3. Do not prioritize generic page refresh buttons unless stale data remains a concrete issue.
4. Keep lightweight placeholder-first rendering for slow fields.

If the user wants to continue privacy work:

1. Perform the full public-repo privacy/history audit.
2. Add/strengthen `.gitignore` protections.
3. Rotate any secret only if actual historical exposure is found.

## 17. Current truly unfinished checklist

### Evidence / knowledge base

- [ ] Finish Stage 1 archive completeness audit.
- [ ] Fill missing primary evidence.
- [ ] Produce Stage 1 completion manifest.
- [ ] Start Stage 2 per-project Evidence Maps.
- [ ] Build approved atomic facts.
- [ ] Create `knowledge/FACT_INDEX.json` in private CV repo.
- [ ] Create `knowledge/CAPABILITY_ONTOLOGY.json` in private CV repo.
- [ ] Create `knowledge/INDUSTRY_TRANSLATION_MAP.json` in private CV repo.
- [ ] Add true embedding/vector semantic retrieval.
- [ ] Add reranker and translation-confidence classification.
- [ ] Validate retrieval against representative Tech / Quant / Pharma / Consulting JDs.

### Job Radar UX

- [ ] Extend optimistic state transitions to the full application lifecycle.
- [ ] Reduce remaining imperative DOM patches over time by moving behavior into shared React state.

### Privacy / public repo

- [ ] Complete historical commit/PR privacy audit.
- [ ] Confirm/add strict `.gitignore` protections.

## 18. Previously unfinished items that are now COMPLETE

Do not re-open these unless the user reports a regression:

- [x] Hard requirement exclusion separated from preference learning.
- [x] Navigation state persistence.
- [x] First-pass job data cache.
- [x] Manual Chrome bookmark save directly to pending application.
- [x] Independent popup names for rapid manual saves.
- [x] Pending application appears immediately without full-page refresh.
- [x] Pending application inserted into the correct formal list, not the summary-card region.
- [x] New pending card appears first and old records move down.
- [x] No forced scroll to the newly inserted card.
- [x] Pending summary count updates immediately.
- [x] Human verification approval no longer requires a full page reload.
- [x] First-phase optimistic save/ignore/approval interactions.
- [x] CV Knowledge Base page / schema / backend retrieval infrastructure.
- [x] Graceful fallback when structured CV knowledge files do not yet exist.

## 19. Communication / working style for the next chat

The user prefers direct execution through available GitHub tools.

Do not send the user to Terminal for GitHub operations when the GitHub connector can perform them.

For code changes, preferred flow:

1. inspect current main;
2. create branch;
3. make changes;
4. open PR;
5. check CI if triggered;
6. fix failures rather than claiming success;
7. merge only after acceptable checks;
8. return the final merged main commit SHA for Site sync.

Do not claim tests/build/lint ran unless they were actually observed.

Keep Chinese explanations clear and compact, but preserve enough implementation detail for continuity.
