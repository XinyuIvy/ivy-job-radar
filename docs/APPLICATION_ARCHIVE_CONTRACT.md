# Future Application Archive Contract

Status: **agreed future contract; not implemented in the current stage**.

This specification preserves the lookup contract for the future private `XinyuIvy/job-application-archive` repository. It is intentionally separate from the current retrieval-evaluation work.

## Application identifier

Each application must have a stable archive identifier such as:

```text
APP-2026-ALI-001
```

The `application_id` is a primary key only. It does not encode or replace the job description, company data, or application state.

Do not reuse a company requisition ID, a database row ID, or an Ivy Job Radar UI identifier as the archive primary key unless an explicit mapping record connects it to the stable `APP-...` identifier.

## Full-JD persistence requirement

When this future archive is implemented, Ivy Job Radar must persist the complete job-description snapshot that was actually used for the application. A URL, extracted keyword list, or partial description is not sufficient.

The archive must retain the exact captured JD text even if the source posting later changes or disappears.

## Fixed lookup behavior

Given an `application_id`, downstream ChatGPT/CV workflows must resolve the corresponding application package at the deterministic archive path and read at minimum:

```text
application_record.yaml
jd_snapshot.md
```

If either required file or the requested `application_id` cannot be found, the workflow must stop and report the missing archive record. It must not guess the company, role, JD text, application state, or submitted CV from memory, current web pages, a requisition string, or another application's files.

## Expected directory layout

Recommended canonical layout:

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

`application_record.yaml` should contain the archive primary key and stable metadata/mappings; `jd_snapshot.md` should contain the full captured JD. Derived files such as analysis, customized CVs, change logs, evidence manifests, and interview briefs must remain linked to that same application record.

## Source responsibilities

| Content | Source of truth |
|---|---|
| Application identity, full JD snapshot, application state, submitted application package | future private application archive |
| CV templates, canonical facts, capabilities, ontology | `XinyuIvy/CV` |
| Primary papers, supplements, code, proposal/source repositories | authoritative evidence archive/source repositories |
| Current job-search UI and runtime workflow | `XinyuIvy/ivy-job-radar` |

## Current-stage boundary

Do **not** create the application archive repository, application packages, or migration code during retrieval evaluation/baseline evaluation. This file only preserves the already-agreed contract so a later implementation does not invent incompatible identifier or lookup semantics.
