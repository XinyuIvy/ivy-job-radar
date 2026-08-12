# Application Archive Contract

Status: **Job Radar bundle workflow implemented; private archive repository initialized**.

This specification defines the lookup contract for the private `XinyuIvy/job-application-archive` repository. Job Radar creates a versioned, human-review-only application bundle and a copyable Chat prompt. The repository was initialized on 2026-08-12; the workflow continues to fail closed whenever the Site credential cannot write to it.

## Stable application identifier

Each application receives a stable identifier such as:

```text
APP-2026-ALI-0001
```

The archive record explicitly maps this identifier to the Job Radar application row and, when available, the Job Radar job row. The identifier never replaces the full JD or application metadata.

## Full-JD persistence

Job Radar persists the complete job-description snapshot used for the application. A URL, extracted keyword list or partial description is insufficient. The snapshot remains unchanged if the source posting later changes or disappears.

## Deterministic lookup

Given an application ID, downstream Chat/Codex workflows resolve:

```text
applications/<year>/<application-id>/
```

If the requested ID, directory or any required input is missing, the workflow stops and reports the missing record. It must not guess from memory or another application.

## Canonical directory layout

```text
applications/2026/APP-2026-ALI-0001/
├── application_record.yaml
├── jd_snapshot.md
├── jd_requirements.json
├── match_packet.json
├── fact_master_snapshot.md
├── canonical_project_index.jsonl
├── canonical_fact_index.jsonl
├── canonical_capability_index.jsonl
├── canonical_concept_index.jsonl
├── canonical_relation_index.jsonl
├── canonical_retrieval_index.jsonl
├── cv_base.tex
├── chat_prompt.txt
├── match_analysis.md
├── evidence_manifest.json
├── cv_changes.md
├── cv_customized.tex
├── cv_customized.pdf
├── cv_submitted.pdf
└── interview_brief.md
```

The initial bundle freezes complete facts, canonical indexes, the selected TeX mother template, source commits and Job Radar's preliminary match packet. Derived files remain linked to the same application record.

## Human-reviewed operating boundary

- Job Radar's Direct / Transferable / Adjacent / Unsupported result is preliminary only.
- Chat independently reviews the complete JD against the full fact-master snapshot and canonical indexes.
- Matching disagreements that cannot affect the CV are logged without interrupting the user.
- Only disagreements that can change CV content are shown for confirmation, in batches of at most five.
- Content is drafted and finalized in Chat before any TeX file is created.
- `cv_customized.tex` inherits the selected `cv_base.tex` layout and commands rather than using a generic template.
- JD keywords have priority when facts support them. Non-conflicting industry keywords already present in the mother template are retained when useful.
- Automatic TeX generation, automatic CV publication and application-status mutation remain disabled.

## Source responsibilities

| Content | Source of truth |
|---|---|
| Application identity, full JD snapshot and application-specific outputs | private application archive |
| CV templates, canonical facts, capabilities and ontology | `XinyuIvy/CV` |
| Primary papers, supplements, code and project documentation | authoritative evidence repositories |
| Job-search UI and runtime workflow | `XinyuIvy/ivy-job-radar` |

## Privacy boundary

The Site never falls back to writing private JD or CV material into the public `XinyuIvy/ivy-job-radar` repository or into `XinyuIvy/CV`. If `XinyuIvy/job-application-archive` is absent or the configured credential lacks access, bundle creation stops with an explicit initialization or permission error.
