# Ivy Job Radar Application Autofill (V4.1)

Chrome Manifest V3 extension for user-triggered job-application autofill.

## What it does

- Fills stable profile fields such as identity, contact, address, professional links, work authorization, sponsorship, relocation and other configured application fields.
- Uses generic label/name/placeholder matching plus custom combobox support so it works across Greenhouse, Lever, Ashby, Workday and many custom ATS pages.
- Runs only when the user clicks **填写当前申请页 + CV** in the extension popup.
- Stores the cross-application profile in `chrome.storage.local` on the user's browser.
- Imports both the saved profile and a derived Job Radar bridge key from Ivy Job Radar `/autofill`.
- Matches the current job page to the user's **待提交申请** record using exact URL, stable job ID, or canonical URL. If the page is ambiguous, it asks the user to choose instead of guessing.
- Uses the matched `APP-ID` as the application-specific source key.
- After the final customized CV is built, `job-application-archive` generates `application_autofill_<APP-ID>.json` directly from `cv_customized_<APP-ID>.tex`. The packet preserves the final CV's Education, Industry Experience, Research/Projects, Skills and Publications order and wording.
- Education, employment, project, skills and publication form fields prefer that APP-specific packet. Project date pairs labelled as “起止时间”, project textareas labelled only as “描述”, and project fields labelled only as “角色 / Role” are recognized from their surrounding project block. Role wording such as “第一作者” or “独立开发者” is copied from the finalized packet rather than guessed from the description. The manually maintained standard profile is only a fallback when no finalized packet exists.
- V4.1 performs a final identity-based date pass after the normal fill. Education periods are bound to the school value in the same card, project periods are bound to the project name in the same card, and read-only calendar inputs such as award year are updated programmatically.
- Education dates are corrected by the school already present in each education block, including when a recruiting site or resume parser prefilled the wrong dates.
- Repeated language blocks fill only the language name (`中文 / 普通话`, `英语`). Proficiency remains manual because recruiting-site option labels vary.
- Repeated award blocks fill the verified year, award name and description. Award attachments remain manual.
- Repeated portfolio blocks fill AI Usage Dashboard and Ivy Job Radar URLs plus their verified descriptions. Portfolio attachments remain manual.
- When the matched application already has `cv_customized_<APP-ID>.pdf` in the private archive, downloads it through an authenticated Job Radar endpoint and attaches it only to a Resume/CV file input.
- Surfaces unresolved required/open-ended questions and lets the user copy them for review or drafting in Chat.

## Safety boundaries

- Never clicks Submit / Apply / Finish.
- Never auto-fills EEO, race, ethnicity, gender, disability, veteran, religion, marital status, sexual orientation, pronouns, date of birth, SSN or similar sensitive questions.
- Never guesses which application-specific CV or experience packet to use when multiple pending applications share the same recruiting portal URL.
- Never fills cover-letter, transcript, portfolio or other non-resume file inputs with the CV.
- Does not bypass CAPTCHA or anti-bot controls.
- Open-ended questions are surfaced but not fabricated automatically.
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

V3 provides APP-ID-aware form filling, application-specific experience/project/education data from the final customized CV, and finalized CV attachment. It fills only form sections that are already present on the page; it does not automatically click arbitrary "Add another experience/project" controls. It still does not autonomously draft open-ended answers or submit applications. Those remain human-reviewed steps.
