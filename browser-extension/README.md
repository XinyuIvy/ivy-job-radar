# Ivy Job Radar Application Autofill (MVP)

Chrome Manifest V3 extension for user-triggered job-application autofill.

## What it does

- Fills common identity, contact, location, professional-link, education, work-authorization, sponsorship and relocation fields.
- Uses generic label/name/placeholder matching so it works across Greenhouse, Lever, Ashby, Workday and many custom ATS pages.
- Runs only when the user clicks **填写当前申请页** in the extension popup.
- Stores the application profile in `chrome.storage.local` on the user's browser.
- Can import the profile saved on Ivy Job Radar `/autofill` from the current tab.

## What it deliberately does not do

- Never clicks Submit / Apply / Finish.
- Never auto-fills EEO, race, ethnicity, gender, disability, veteran, religion, marital status, sexual orientation, pronouns, date of birth, SSN or similar sensitive questions.
- Does not answer open-ended application questions.
- Does not bypass CAPTCHA or anti-bot controls.
- Does not currently upload a per-application CV automatically.

## Install locally in Chrome

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this `browser-extension/` directory.
6. Open the extension's **编辑资料** page, or open Ivy Job Radar `/autofill`, save the profile there, then use **从当前 Job Radar 页面导入资料**.

## Usage

1. Open the company's application form.
2. Click the Ivy Job Radar Autofill extension.
3. Click **填写当前申请页**.
4. Review every filled field and complete anything that was skipped.
5. Submit manually after review.

## Current scope

This is the first usable autofill layer. Platform-specific adapters, per-`APP-...` resume upload, open-question drafting and post-submit status synchronization are intentionally left for later iterations after this generic mapper is validated on real forms.
