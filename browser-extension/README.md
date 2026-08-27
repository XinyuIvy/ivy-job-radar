# Ivy Job Radar Application Autofill (V6.1)

Chrome Manifest V3 extension for manual autofill and guarded application-automation pilots.

## What it does

- Fills stable profile fields such as identity, contact, address, professional links, work authorization, sponsorship, relocation and other configured application fields.
- Uses generic label/name/placeholder matching plus custom combobox support so it works across Greenhouse, Lever, Ashby, Workday and many custom ATS pages.
- Keeps the manual **填写当前申请页 + CV** flow and also polls Job Radar every five minutes for an approved automation task while Chrome is running.
- Stores the cross-application profile in `chrome.storage.local` on the user's browser.
- Imports both the saved profile and a derived Job Radar bridge key from Ivy Job Radar `/autofill`.
- Matches the current job page to the user's **待提交申请** record using exact URL, stable job ID, or canonical URL. If the page is ambiguous, it asks the user to choose instead of guessing.
- Uses the matched `APP-ID` as the application-specific source key.
- After the final customized CV is built, `job-application-archive` generates `application_autofill_<APP-ID>.json` directly from `cv_customized_<APP-ID>.tex`. The packet preserves the final CV's Education, Industry Experience, Research/Projects, Skills and Publications order and wording.
- Education, employment, project, skills and publication form fields prefer that APP-specific packet. Project date pairs labelled as “起止时间”, project textareas labelled only as “描述”, and project fields labelled only as “角色 / Role” are recognized from their surrounding project block. Role wording such as “第一作者” or “独立开发者” is copied from the finalized packet rather than guessed from the description. The manually maintained standard profile is only a fallback when no finalized packet exists.
- V4.3 binds the first three education blocks as doctorate, master's and bachelor's entries and overwrites stale parser values as a complete block, so school, degree, major and dates cannot drift into different records.
- V4.8 fills education inside the primary click handler instead of skipping it and waiting for a supplemental script. Three manually opened blank education cards are bound by DOM order as doctorate, master's, and bachelor's records; dates adapt to month or full-day controls.
- V4.9 preserves every value already present on the application page and fills only genuinely blank controls across education, projects, employment, publications, awards, and other supported sections.
- V4.10 recognizes publication cards from their title input, author and venue selectors, date control, and details textarea even when the recruiting site does not associate visible labels with those controls.
- V4.11 auto-adds verified repeated rows for education, employment/internships, projects, awards, languages, portfolio links, campus activities, and publications. It clicks only the explicit Add button inside the matching section and does not create rows when no authoritative records exist.
- V4.11 fills a publication Level selector only from the stored per-venue ranking record. The profile keeps the ranking year, JCR/CAS/CCF evidence, selected Level, and source URL; unranked conferences and preprint servers remain blank.
- V4.14 keeps the explicit Chinese profile / English profile selector and adds bilingual birthplace, native place, gender, awards, publication descriptions, DOI links, and separate verified journal-ranking fields.
- V5.0 adds a background task runner. It claims only a Job Radar task whose tailored CV and structured application decision are ready, opens the exact job URL, fills blank fields, uploads that task's CV, and performs a final form audit.
- V6.1 never clicks the final submit button. After an approved batch is ready, it processes up to ten tasks, keeps every application tab open, and leaves the final review and submission to the user.
- V6.0 adds API-based semantic question handling after deterministic autofill. It sends only unresolved, non-sensitive application questions together with the verified JD and a privacy-reduced career profile, then fills only answers supported with at least 90 percent confidence.
- V6.0 keeps confirmed salary, relocation, non-compete and selected demographic answers in the private Job Radar profile. Confirmed demographic values are filled locally and are never sent to the model. SSN is not stored or filled.
- V6.1 processes an approved batch with two guarded workers so multiple forms can be prepared without overwhelming the browser. Every completed or recoverable application tab remains open for manual inspection.
- Date controls are detected from type, placeholder, surrounding block and accepted-value feedback. Month controls receive `YYYY-MM`; full-date controls receive `YYYY-MM-DD` with the first day for a start/neutral month and the last day for an end month when only month precision is available.
- Education, employment/internship, project, language, portfolio, skills, awards and publications are inferred from section meaning plus control structure, not only exact labels. In an award block, date/select/textarea controls map to award date/type/details. In a publication block, title/date/select/textarea controls map to title, publication date, author order or venue, and details. Low-confidence fields remain empty instead of being guessed.
- V4.7 reads each control's direct label before using section structure, so a card containing every publication/project label cannot cross-wire title, date, author, venue, role, or details fields.
- V4.7 actively clicks the section's explicit Add button and waits for the page to render each new row before continuing. Publication rows use the complete global published/review/revision/preprint list; project rows use only the current APP's finalized project list.
- V4.7 binds a whole publication or project record to one rendered row. A publication tier selector such as Level 1/2/3 is filled only from an explicit authoritative tier; a journal name is never used to guess the tier. Publication details contain the verified research summary rather than the journal name.
- V4.7 fills the confirmed phone, native place, ethnicity, date of birth, and WeChat fields from the global profile; sensitive fields remain blocked unless explicitly supported by a confirmed profile key.
- V4.5 binds every education card to one complete doctorate, master's, or bachelor's record before writing any field; unverified full dates are cleared instead of guessed.
- V4.5 freezes semantic section classification before writing, isolates employment descriptions from awards, and compensates one-day timezone shifts in full-date controls.
- V4.4 handles `div`-based ARIA comboboxes without invoking native input setters on non-input elements.
- Repeated language blocks fill only the language name (`中文 / 普通话`, `英语`). Proficiency remains manual because recruiting-site option labels vary.
- Repeated award blocks fill the verified year, award name and description. Award attachments remain manual.
- Repeated portfolio blocks fill AI Usage Dashboard and Ivy Job Radar URLs plus their verified descriptions. Portfolio attachments remain manual.
- When the matched application already has `cv_customized_<APP-ID>.pdf` in the private archive, downloads it through an authenticated Job Radar endpoint and attaches it only to a Resume/CV file input.
- Surfaces unresolved required/open-ended questions and lets the user copy them for review or drafting in Chat.

## Safety boundaries

- Never clicks a final Submit / Finish action. The user reviews every retained application tab and submits manually.
- Never sends EEO, race, ethnicity, gender, disability, veteran, religion, date-of-birth, SSN or similar sensitive questions to the model. Only locally stored values explicitly confirmed by the user may fill supported demographic controls.
- Never stores or auto-fills SSN, financial credentials, passwords, or identity-document numbers.
- Never guesses which application-specific CV or experience packet to use when multiple pending applications share the same recruiting portal URL.
- Never fills cover-letter, transcript, portfolio or other non-resume file inputs with the CV.
- Does not bypass CAPTCHA or anti-bot controls.
- Open-ended questions are answered only from verified facts and the JD. Missing evidence, ambiguity, or legal attestation sends the task to review.
- Application-specific CV/packet retrieval requires the derived Job Radar autofill key and private archive server credentials; the private GitHub token is never stored in the extension.
- The APP-specific packet is generated only from the final customized CV; it does not add projects or claims that are absent from that CV.

## Install locally in Chrome

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this `browser-extension/` directory.
6. Open Ivy Job Radar `/autofill`, save the profile, then open the extension and click **从当前 Job Radar 页面导入资料**.
7. Chrome will ask once for permission to access that Job Radar site origin so the extension can retrieve your own application context and finalized CV data.

## Usage

1. Make sure the target role is in **待提交申请**.
2. Finalize the application-specific CV. The archive build should contain `cv_customized_<APP-ID>.pdf` and `application_autofill_<APP-ID>.json`.
3. Open the company's application form.
4. Click the Ivy Job Radar Autofill extension.
5. Confirm the detected application; if several roles share one portal URL, choose the correct one from the dropdown.
6. Click **填写当前申请页 + CV**.
7. Review every filled field, use **复制未填问题** for anything the extension intentionally leaves unresolved, and submit manually.

## Current scope

V6.1 preserves guarded semantic answers for custom questions and changes the batch runner to a permanent manual-submit workflow. The extension may open up to ten approved application pages, add repeated rows, fill blank values, call the configured API for unresolved questions, upload each exact prebuilt CV, and audit the form. It never clicks final Submit and never closes the prepared tabs. CAPTCHA, authentication, unconfirmed sensitive fields, unsupported questions, missing required fields, non-resume attachments, an unknown ATS, and ambiguous controls remain visible for the user's review.
