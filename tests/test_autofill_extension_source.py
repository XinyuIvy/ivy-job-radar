import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "browser-extension"


class ApplicationAutofillSourceTests(unittest.TestCase):
    def test_manifest_remains_manual_trigger_only(self):
        manifest = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["manifest_version"], 3)
        self.assertIn("activeTab", manifest["permissions"])
        self.assertIn("scripting", manifest["permissions"])
        self.assertNotIn("content_scripts", manifest)
        self.assertNotIn("host_permissions", manifest)
        self.assertIn("optional_host_permissions", manifest)

    def test_content_script_never_submits_and_resume_upload_is_narrowly_scoped(self):
        content = (EXT / "content.js").read_text(encoding="utf-8")
        self.assertIn(':not([type="submit"])', content)
        self.assertIn("SUBMIT_RE", content)
        self.assertNotIn("form.submit(", content)
        self.assertNotIn("requestSubmit(", content)
        self.assertIn('input[type="file"]', content)
        self.assertIn("RESUME_RE", content)
        self.assertIn("NON_RESUME_FILE_RE", content)
        self.assertIn("DataTransfer", content)
        self.assertIn("IVY_UPLOAD_RESUME", content)

    def test_sensitive_application_questions_are_skipped(self):
        content = (EXT / "content.js").read_text(encoding="utf-8")
        for term in ["race", "ethnic", "gender", "veteran", "disability", "religion", "date of birth", "social security", "eeo"]:
            self.assertIn(term, content.lower())
        self.assertIn("SENSITIVE_RE.test(text)", content)

    def test_common_application_fields_are_supported(self):
        content = (EXT / "content.js").read_text(encoding="utf-8")
        for key in [
            "identity.firstName",
            "identity.lastName",
            "identity.email",
            "identity.phone",
            "location.address1",
            "location.postalCode",
            "links.linkedin",
            "links.github",
            "education.school",
            "education.degree",
            "education.major",
            "employment.employer",
            "employment.title",
            "eligibility.age18",
            "eligibility.workAuthorizationUS",
            "eligibility.sponsorshipUS",
            "application.availableStartDate",
        ]:
            self.assertIn(key, content)
        self.assertIn("setCombobox", content)
        self.assertIn("unresolvedQuestions", content)

    def test_job_radar_profile_page_uses_local_storage_and_bridge_config(self):
        page = (ROOT / "app" / "autofill" / "page.tsx").read_text(encoding="utf-8")
        client = (ROOT / "app" / "autofill" / "autofill-profile-client.tsx").read_text(encoding="utf-8")
        self.assertIn("deriveBookmarkCaptureKey", page)
        self.assertIn("ivy_job_application_profile_v1", client)
        self.assertIn("ivy_job_autofill_config_v1", client)
        self.assertIn("window.localStorage.setItem", client)
        self.assertIn("不会点击 Submit", client)
        self.assertIn("最终定制 CV", client)

    def test_popup_matches_application_and_attaches_finalized_cv(self):
        popup = (EXT / "popup.js").read_text(encoding="utf-8")
        self.assertIn("/api/autofill/application-context", popup)
        self.assertIn("/api/autofill/resume", popup)
        self.assertIn("X-Ivy-Autofill-Key", popup)
        self.assertIn("IVY_UPLOAD_RESUME", popup)
        self.assertIn("复制未填问题", (EXT / "popup.html").read_text(encoding="utf-8"))
        self.assertNotIn("CV_GITHUB_TOKEN", popup)
        self.assertNotIn("APPLICATION_ARCHIVE_GITHUB_TOKEN", popup)

    def test_server_resume_bridge_requires_derived_key_and_private_archive(self):
        context_route = (ROOT / "app" / "api" / "autofill" / "application-context" / "route.ts").read_text(encoding="utf-8")
        resume_route = (ROOT / "app" / "api" / "autofill" / "resume" / "route.ts").read_text(encoding="utf-8")
        for source in [context_route, resume_route]:
            self.assertIn("deriveBookmarkCaptureKey", source)
            self.assertIn("secureBookmarkKeyEqual", source)
            self.assertIn("x-ivy-autofill-key", source.lower())
        self.assertIn("APPLICATION_ARCHIVE_GITHUB_TOKEN", resume_route)
        self.assertIn("cv_customized_${archiveId}.pdf", resume_route)
        self.assertIn("application/vnd.github.raw+json", resume_route)
        self.assertIn("canonicalizeJobIdentityUrl", context_route)
        self.assertIn("extractStableJobId", context_route)
        self.assertIn("needsSelection", context_route)


if __name__ == "__main__":
    unittest.main()
