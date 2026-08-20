# CV mother-template selection contract

CV tailoring must not silently choose the final mother template on the user's behalf.

1. Job Radar may infer and display a recommended track/language from the application metadata.
2. Before an application bundle is created, the user must explicitly select one supported canonical TeX mother template.
3. The selected template determines the `track` and `language` sent to CV analysis and archive creation.
4. The selected TeX file is frozen into the application archive as `cv_base.tex` and recorded in `application_record.yaml`.
5. The archive action remains disabled until both a CV mother template and a non-empty confirmed JD are present.
6. Existing application archives remain immutable: revisiting an already-created APP-ID does not replace its previously frozen `cv_base.tex`.

The canonical templates are maintained under `XinyuIvy/CV/master/template-cv/`.
