# Source synchronization

## 2026-11-07 reconciliation

The public GitHub repository and the private Sites source repository had diverged. This update reconciles the Sites implementation at `d9a060dbd157a6803c3070143af9701ca7c7d44e` with GitHub main at `34456319930e5a82aaf0ce4b91d9c5f38e74156b`.

The merge imports the learned embedding/reranker evidence Q&A, current CV template and shared prompt contracts, company watchlist, interview guide, and source/data walkthrough implementation. It retains GitHub's later evidence eligibility checks, current canonical amendment support, collection test scope, submission integration, and authenticated recovery endpoint. CV generation remains paused.

### Data boundaries

- Existing GitHub scan snapshots and submission records are retained; private Sites copies do not overwrite them.
- Personal job overrides, manual review history, and company personal notes are represented by empty JSON configuration containers in the public checkout. Populate them only in an appropriate private deployment.
- `app/project-walkthrough/source-snapshot.json` is generated from the current checkout during a build and is ignored by Git. The private Sites snapshot is not published into this repository.
- Environment files, runtime secrets, private CVs, application bundles, build caches and Sites deployment archives are excluded.
- The walkthrough data API requires site authentication and exposes only bounded, fixed read queries. It does not generate CVs, execute scans or call models.

### Future updates

The `Sync latest job snapshot` workflow synchronizes job data into the website, not source code. This reconciliation does not create a recurring source mirror. Compare both heads and reconcile changes before future publication; do not copy an entire private checkout over public main.

Build and validate the reconciled source before deploying it. Updating this public repository alone does not deploy it to Sites or update the site's D1/R2 data. The current site's original business-source snapshot remains a historical reference until deliberately regenerated there.

### Existing limitations

Source synchronization does not update upstream evidence indexes, resolve all outdated fact values, complete missing browser-answer/contact routes, or enable paused generation. Historical retrieval metrics and examples in the interview notes are not a statement of current fact freshness.
