import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AutofillV3IntegrationContractTests(unittest.TestCase):
    def test_app_specific_packet_is_end_to_end(self):
        popup = (ROOT / "browser-extension" / "popup.js").read_text(encoding="utf-8")
        content = (ROOT / "browser-extension" / "content.js").read_text(encoding="utf-8")
        route = (ROOT / "app" / "api" / "autofill" / "application-packet" / "route.ts").read_text(encoding="utf-8")
        manifest = (ROOT / "browser-extension" / "manifest.json").read_text(encoding="utf-8")

        self.assertIn('"version":"0.3.0"', manifest)
        self.assertIn('/api/autofill/application-packet', popup)
        self.assertIn('applicationPacket', popup)
        self.assertIn('message.applicationPacket || null', content)
        self.assertIn('final_customized_cv_only', content)
        self.assertIn('application_autofill_${archiveId}.json', route)
        self.assertIn('packet.application_id !== archiveId', route)

    def test_final_cv_packet_overrides_profile_for_cv_specific_sections(self):
        content = (ROOT / "browser-extension" / "content.js").read_text(encoding="utf-8")
        for key in [
            'education.school',
            'education.degree',
            'education.major',
            'employment.employer',
            'employment.title',
            'employment.description',
            'project.name',
            'project.role',
            'project.description',
            'cv.skills',
            'cv.publications',
        ]:
            self.assertIn(key, content)
        self.assertIn('packetEntryValue', content)
        self.assertIn('if (packetValue.handled) return packetValue.value', content)


if __name__ == "__main__":
    unittest.main()
