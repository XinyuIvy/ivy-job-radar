import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / "browser-extension"


class ApplicationAutofillSourceTests(unittest.TestCase):
    def test_manifest_is_manual_trigger_only(self):
        manifest = json.loads((EXT / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["manifest_version"], 3)
        self.assertIn("activeTab", manifest["permissions"])
        self.assertIn("scripting", manifest["permissions"])
        self.assertNotIn("content_scripts", manifest)
        self.assertNotIn("host_permissions", manifest)

    def test_content_script_never_targets_submit_or_file_inputs(self):
        content = (EXT / "content.js").read_text(encoding="utf-8")
        self.assertIn(':not([type="file"])', content)
        self.assertIn(':not([type="submit"])', content)
        self.assertIn("SUBMIT_RE", content)
        self.assertNotIn("form.submit(", content)
        self.assertNotIn("requestSubmit(", content)

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
            "links.linkedin",
            "links.github",
            "education.school",
            "education.degree",
            "education.major",
            "eligibility.workAuthorizationUS",
            "eligibility.sponsorshipUS",
        ]:
            self.assertIn(key, content)

    def test_job_radar_profile_page_uses_local_storage_not_repo_storage(self):
        client = (ROOT / "app" / "autofill" / "autofill-profile-client.tsx").read_text(encoding="utf-8")
        self.assertIn("ivy_job_application_profile_v1", client)
        self.assertIn("window.localStorage.setItem", client)
        self.assertIn("不会自动点击 Submit", client)


if __name__ == "__main__":
    unittest.main()
