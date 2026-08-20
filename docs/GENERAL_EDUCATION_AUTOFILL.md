# General Education Autofill

Chinese campus recruiting sites often render education forms with custom wrappers instead of native `<label>` elements. The browser extension therefore treats education autofill as a generic structured-form problem rather than a site-specific adapter.

Rules:

- Read nearby sibling/ancestor label text in addition to `label`, `aria-label`, and ATS automation attributes.
- When an education block already contains a school name, use that school to select the matching entry in the global application profile instead of relying only on occurrence order.
- Recognize grouped study-period controls such as `起止时间` / `就读时间` and map the first control to start date and the second to end date.
- Never invent missing months or ambiguous degree-type semantics. If the global profile only has a year, fill a year-only control when the page clearly accepts a year; otherwise leave the date control unresolved.
- This logic is shared across Tencent, ByteDance, Alibaba, and other application sites; it must not be keyed to a single hostname.
