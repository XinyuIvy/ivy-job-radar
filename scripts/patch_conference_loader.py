from pathlib import Path

path = Path("app/api/cv-tailor/analyze/route.ts")
text = path.read_text(encoding="utf-8")

replacements = [
(
'    const [template, factIndexJsonl, statusAddendumJsonl, conceptEdgesJsonl, credentialIndexJsonl, courseworkIndexJsonl, profileIndexJsonl, literatureIndexJsonl] = await Promise.all([',
'    const [template, factIndexJsonl, statusAddendumJsonl, conceptEdgesJsonl, credentialIndexJsonl, courseworkIndexJsonl, profileIndexJsonl, literatureIndexJsonl, conferenceIndexJsonl] = await Promise.all(['
),
(
'      readPrivateFile("master/project-evidence/LITERATURE_INDEX.jsonl", token),\n    ]);',
'      readPrivateFile("master/project-evidence/LITERATURE_INDEX.jsonl", token),\n      readPrivateFile("master/project-evidence/CONFERENCE_INDEX.jsonl", token),\n    ]);'
),
(
'      ...parseJsonl<StructuredFactRecord>(literatureIndexJsonl),\n    ];',
'      ...parseJsonl<StructuredFactRecord>(literatureIndexJsonl),\n      ...parseJsonl<StructuredFactRecord>(conferenceIndexJsonl),\n    ];'
),
(
'  if (record.record_type === "research_literature") return "Scholarly literature workflow";\n  if (record.record_type === "professional_service") return "Professional service";',
'  if (record.record_type === "research_literature") return "Scholarly literature workflow";\n  if (record.record_type === "conference_participation") return `Conference participation · ${record.conference ?? "conference"}${record.year ? ` ${record.year}` : ""}`;\n  if (record.record_type === "professional_service") return "Professional service";'
),
(
'    retrievalChannels: [record.record_type === "coursework" ? "coursework_index" : record.record_type === "education_credential" ? "credential_index" : "profile_index"],',
'    retrievalChannels: [record.record_type === "coursework" ? "coursework_index" : record.record_type === "education_credential" ? "credential_index" : record.record_type === "conference_participation" ? "conference_index" : "profile_index"],'
),
(
'  if (evidence.evidenceType === "professional_service") return zh ? "学术服务" : "Professional Service";',
'  if (evidence.evidenceType === "conference_participation") return zh ? "学术会议 / 学术服务" : "Conferences / Professional Service";\n  if (evidence.evidenceType === "professional_service") return zh ? "学术服务" : "Professional Service";'
),
]

for old, new in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f"Expected route pattern not found: {old[:100]}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("patched", path)
