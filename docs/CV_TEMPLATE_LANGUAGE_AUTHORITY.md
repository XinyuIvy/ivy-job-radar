# CV Template Language Authority

The CV mother template explicitly selected by the user is an authoritative application input.

- `language` and the selected template file are frozen into `application_record.yaml`.
- `cv_base.tex` must be the exact selected mother template.
- The copyable Chat prompt must explicitly state the selected language and template and must prohibit silently falling back to an English/default template.
- If a legacy application archive predates explicit template selection, the next explicit selection may repair only the template-dependent frozen inputs while preserving backups of the pre-selection base/template metadata.
- If `application_record.yaml`, `cv_base.tex`, and the prompt disagree about language/template, downstream customization must stop rather than guess.
