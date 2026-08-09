from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_template_coverage_is_not_flat_literal_matching_anymore():
    route = read("app/api/cv-tailor/analyze/route.ts")
    assert "buildCvTemplateIndex" in route
    assert "searchCvTemplate" in route
    assert 'templateMatching: "independent_semantic_snippet_index"' in route
    assert 'supportEvidence: covered ? []' not in route
    assert "hasAlias(templateText, rule.literalTerms)" not in route


def test_template_index_keeps_traceable_snippets_and_relation_paths():
    source = read("app/lib/cv-template-index.ts")
    for field in ["snippetId", "templateName", "section", "rawLatex", "visibleText", "conceptIds", "factIds", "sourceFile", "location", "present"]:
        assert field in source
    for relation in ["exact_equivalent", "native_synonym", "narrower_than", "evidence_for", "transferable_to", "related_only", "excluded"]:
        assert relation in read("app/lib/cv-capability-ontology.ts")


def test_biostatistics_and_neuroimaging_have_safe_broader_relations():
    ontology = read("app/lib/cv-capability-ontology.ts")
    assert '{ from: "biostatistics", to: "statistics", type: "narrower_than" }' in ontology
    assert '{ from: "biostatistics", to: "stem_field", type: "narrower_than" }' in ontology
    assert '{ from: "neuroimaging_research", to: "stem_research", type: "narrower_than" }' in ontology
    assert '{ from: "biomedical_research", to: "stem_research", type: "narrower_than" }' in ontology
    assert '{ from: "published_journal_article", to: "peer_reviewed_publication", type: "evidence_for" }' in ontology


def test_rl_named_methods_and_pytorch_are_never_inferred_from_broad_experience():
    ontology = read("app/lib/cv-capability-ontology.ts")
    assert '{ from: "reinforcement_learning", to: "ppo", type: "excluded"' in ontology
    assert '{ from: "reinforcement_learning", to: "dpo", type: "excluded"' in ontology
    assert '{ from: "reinforcement_learning", to: "grpo", type: "excluded"' in ontology
    assert '{ from: "python", to: "pytorch", type: "excluded"' in ontology
    assert '{ from: "agent_system", to: "reinforcement_learning", type: "related_only" }' in ontology


def test_alibaba_sibling_requirements_are_independent_rules():
    ontology = read("app/lib/cv-capability-ontology.ts")
    labels = [
        "Reinforcement learning", "PPO", "DPO", "GRPO", "RL post-training", "Reward design",
        "Training stability", "Exploration efficiency", "Generalization", "Agent system",
        "Autonomous decision making", "Agent planning", "Tool calling", "Code execution",
        "Experiment validation", "Agentic data generation", "Data cleaning", "Data filtering",
        "Data augmentation", "Data mixture", "Data pipeline", "PyTorch", "LLM",
        "Problem definition", "Independent research", "Literature review", "Paper reproduction",
        "Experiment design", "Result analysis", "Scientific writing", "Cross-disciplinary collaboration",
    ]
    for label in labels:
        assert f'label: "{label}"' in ontology


def test_peer_reviewed_publication_requires_published_status():
    structured = read("app/lib/structured-evidence.ts")
    assert "peerReviewedPublicationRequirement" in structured
    assert 'record.publication_status !== "published"' in structured
    assert "Under-review or revision manuscripts and reviewer service do not count as published peer-reviewed papers." in structured


def test_current_status_overlay_is_loaded_and_planned_facts_are_not_coverage_support():
    route = read("app/api/cv-tailor/analyze/route.ts")
    assert "FACT_INDEX_STATUS_ADDENDUM.jsonl" in route
    assert 'fact.fact_status === "planned" ? "Adjacent"' in route
    assert "cannot support completed-experience coverage" in route


def test_ui_shows_jd_original_cv_original_and_relation_path():
    client = read("app/cv-tailor/cv-tailor-client.tsx")
    assert "JD 原文" in client
    assert "当前 CV 命中片段" in client
    assert "关系路径" in client
    assert "Canonical concept" in client
    assert "事实证据" in client
    assert "建议动作" in client
