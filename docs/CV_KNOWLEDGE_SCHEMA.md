# CV Knowledge Base contract

Ivy Job Radar reads the private `XinyuIvy/CV` repository on `main`.

Machine-readable files:

- `knowledge/FACT_INDEX.json`
- `knowledge/CAPABILITY_ONTOLOGY.json`
- `knowledge/INDUSTRY_TRANSLATION_MAP.json`

`FACT_INDEX.json` may be either a JSON array or `{ "facts": [...] }`.

Recommended atomic fact shape:

```json
{
  "fact_id": "project_001",
  "project": "Project name",
  "verified_fact": "A fact directly supported by primary evidence.",
  "exact_methods": ["method actually used"],
  "statistical_concepts": ["higher-level statistical concept"],
  "problems_solved": ["problem this work solved"],
  "transferable_capabilities": ["cross-industry analytical capability"],
  "domains": ["biomedical", "clinical trial"],
  "industry_translation": {
    "tech": ["valid Tech translation"],
    "quant": ["valid Quant translation"],
    "pharma": ["valid Pharma translation"],
    "consulting": ["valid Consulting translation"]
  },
  "prohibited_overclaims": ["claim that primary evidence does not support"],
  "evidence_strength": "high",
  "source_evidence": {
    "source": "paper/supplement/code",
    "location": "section/page/file"
  }
}
```

The website treats retrieval as candidate generation only. A high retrieval score never overrides `verified_fact`, `evidence_strength`, or `prohibited_overclaims`.

Current retrieval weights favor exact methods, statistical concepts and problems solved. A later vector/embedding stage can be added without changing this schema.
