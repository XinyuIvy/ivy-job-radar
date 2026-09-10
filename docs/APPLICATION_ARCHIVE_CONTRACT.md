# Application Archive Contract

Status: implemented for formal application bundles, direct-template submissions and application-specific Autofill.

This document defines how Ivy Job Radar stores a reproducible application record in a private GitHub repository. The archive is the source of truth for the JD and CV associated with one submitted application. It must never be stored in the public Job Radar or CV repository.

## Stable identifiers

Job Radar keeps two identifiers separate:

- `archive_id`: the internal stable ID, for example `APP-2026-ABC-0123`
- `application_id`: the employer or ATS requisition ID when one exists

The private archive path is derived only from `archive_id`:

```text
applications/<year>/<archive-id>/
```

Legacy records that stored an `APP-*` value in `application_id` are migrated into `archive_id`. Downstream code must not guess one application from another company's role or from a shared ATS hostname.

## What is frozen

A formal application bundle records:

- company, role, region, location, source URL and Job Radar row IDs
- the complete JD used for the application
- the selected CV language and mother-template path
- the exact CV repository commit
- the full Fact Master snapshot
- CV display rules and all canonical evidence indexes
- structured JD requirements and the preliminary match packet
- the prompt contract used for final human-reviewed customization

The source posting and live CV repository may change later. The application keeps using the frozen snapshot unless the user starts an explicit revision or replaces the submitted-template snapshot through the supported UI.

## Canonical customized-CV layout

```text
applications/2026/APP-2026-ABC-0123/
├── application_record.yaml
├── jd_snapshot.md
├── jd_requirements.json
├── match_packet.json
├── fact_master_snapshot.md
├── cv_display_rules_snapshot.yaml
├── canonical_project_index.jsonl
├── canonical_fact_index.jsonl
├── canonical_capability_index.jsonl
├── canonical_concept_index.jsonl
├── canonical_relation_index.jsonl
├── canonical_retrieval_index.jsonl
├── canonical_current_addendum.jsonl
├── cv_base.tex
├── chat_prompt.txt
├── cv_customized_APP-2026-ABC-0123.tex
├── cv_customized_APP-2026-ABC-0123.pdf
├── cv_customized_APP-2026-ABC-0123.txt
├── cv_build_manifest_APP-2026-ABC-0123.json
├── cv_submitted_APP-2026-ABC-0123.pdf
├── application_autofill_APP-2026-ABC-0123.json
└── application_autofill_refresh_APP-2026-ABC-0123.json
```

Not every derived file exists at initial bundle creation. Customized and submitted files appear only after the corresponding review and confirmation steps.

## Direct-template submission

A user may submit directly from a CV mother template without creating a customized CV. Job Radar still creates an application folder containing at least:

```text
application_record.yaml
jd_snapshot.md
cv_base.tex
cv_submitted_<APP-ID>.pdf
submitted_template_freeze.json
application_autofill_<APP-ID>.json
```

The PDF is copied from the selected CV repository commit. Later changes to the live mother template do not silently change this submitted snapshot.

## PRECV versus formal application files

The pending-job CV workspace can generate a temporary PRECV draft before a formal application is finalized. That workspace may keep preview PDF, TeX, extracted text, review notes and an application decision in R2. PRECV generation:

- does not create a submitted CV
- does not prove that the user applied
- does not change application status
- does not authorize a final GitHub archive write by Chat

Formal archive files are created or finalized only through the explicit application workflow.

## Human-review boundary

- The full JD is authoritative for employer requirements.
- `fact_master_snapshot.md` is authoritative for candidate facts.
- Canonical indexes support retrieval but cannot invent or override facts.
- `match_packet.json` is preliminary and cannot replace reading the complete JD.
- `cv_base.tex` is the required layout and writing baseline for a customized CV.
- Final content must be reviewed before `cv_customized_<APP-ID>.tex` is committed.
- The private archive workflow may compile the confirmed TeX into PDF, text and a build manifest.
- Application status is never inferred from a generated PDF or an opened browser tab.
- `cv_submitted_<APP-ID>.pdf` represents the version the user confirmed was actually used.

## Autofill precedence

When an application is selected in the Chrome extension, resume retrieval follows this order:

1. `cv_submitted_<APP-ID>.pdf`
2. `cv_customized_<APP-ID>.pdf`
3. the mother-template PDF frozen in the application's `resume_version`

Structured project and experience data prefer `application_autofill_refresh_<APP-ID>.json`, then the customized CV, then the original frozen Autofill packet or `cv_base.tex` fallback.

Selecting a live mother template in the extension is a different mode. It reads the current CV repository and is not tied to an APP-ID.

## Source responsibilities

| Content | Source of truth |
|---|---|
| Job discovery, application status and workflow state | Ivy Job Radar D1 database |
| Temporary CV generation artifacts | Ivy Job Radar R2 bucket |
| CV mother templates, facts and canonical indexes | the configured CV repository |
| Frozen JD, application-specific CV and submitted CV | the private application archive |
| Browser fixed-profile fallback and connection metadata | Chrome local storage |

## Failure behavior

The workflow stops instead of guessing when:

- the APP-ID or required archive folder is missing
- the full JD is unavailable
- the chosen mother template cannot be read
- the CV and archive commits cannot be resolved
- the archive token cannot write to the private repository
- language, template or APP-ID records conflict
- an attempt would silently overwrite a finalized customized or submitted CV

Private GitHub tokens remain on the server. The browser extension receives only authenticated API results and never receives repository credentials.
