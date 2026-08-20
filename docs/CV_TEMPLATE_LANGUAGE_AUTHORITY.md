# CV Template Language Authority

The CV mother template explicitly selected by the user is an authoritative application input.

- `language` and the selected template file are frozen into `application_record.yaml`.
- `cv_base.tex` must be the exact selected mother template.
- The copyable Chat prompt must explicitly state the selected language and template and must prohibit silently falling back to an English/default template.
- If an existing application archive has a different frozen template but does **not** yet contain a finalized customized CV, a new explicit template selection re-freezes the application inputs coherently using the newly confirmed language/template.
- If `cv_customized_<APP-ID>.tex`, its finalized PDF, or `cv_submitted_<APP-ID>.pdf` already exists, changing language/template must fail closed rather than overwrite the finalized history. A later revision workflow must be explicit.
- If `application_record.yaml`, `cv_base.tex`, and the prompt disagree about language/template, downstream customization must stop rather than guess.
