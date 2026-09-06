import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AutofillV3IntegrationContractTests(unittest.TestCase):
    def test_global_profile_and_app_specific_packet_are_end_to_end(self):
        popup = (ROOT / "browser-extension" / "popup.js").read_text(encoding="utf-8")
        content = (ROOT / "browser-extension" / "content.js").read_text(encoding="utf-8")
        packet_route = (ROOT / "app" / "api" / "autofill" / "application-packet" / "route.ts").read_text(encoding="utf-8")
        global_route = (ROOT / "app" / "api" / "autofill" / "general-profile" / "route.ts").read_text(encoding="utf-8")
        global_source = (ROOT / "app" / "lib" / "global-autofill-profile.ts").read_text(encoding="utf-8")
        manifest = (ROOT / "browser-extension" / "manifest.json").read_text(encoding="utf-8")

        self.assertIn('"version":"0.6.9"', manifest)
        self.assertIn('/api/autofill/application-packet', popup)
        self.assertIn('/api/autofill/general-profile', popup)
        self.assertIn('applicationPacket', popup)
        self.assertIn('generalProfile', popup)
        self.assertIn('message.generalProfile || null', content)
        self.assertIn('message.applicationPacket || null', content)
        self.assertIn('message.profileLanguage || ""', content)
        self.assertIn('message.projectPlacement || "auto"', content)
        self.assertIn('final_customized_cv_only', content)
        self.assertIn('frozen_submitted_template', content)
        self.assertIn('live_cv_template', content)
        for key in [
            'award.type', 'award.summary', 'publication.title', 'publication.authorOrder',
            'publication.date', 'publication.venue', 'publication.details',
        ]:
            self.assertIn(key, content)
        self.assertIn('sectionFromText', content)
        self.assertIn('semanticSectionKey', content)
        self.assertIn('global-application-autofill-profile-v1', content)
        self.assertIn('application_autofill_${archiveId}.json', packet_route)
        self.assertIn('application_autofill_refresh_${archiveId}.json', packet_route)
        self.assertIn('provenance: "live_template"', packet_route)
        self.assertIn('provenance: "refreshed_template_autofill"', packet_route)
        self.assertIn('packet.application_id !== archiveId', packet_route)
        self.assertIn('fetchRepositoryGlobalAutofillProfile', global_route)
        self.assertIn('application-autofill-profile.md', global_source)

    def test_global_education_and_app_specific_cv_sections_have_separate_authorities(self):
        content = (ROOT / "browser-extension" / "content.js").read_text(encoding="utf-8")
        for key in [
            'education.school',
            'education.degreeType',
            'education.degree',
            'education.college',
            'education.major',
            'education.advisor',
            'education.researchUnit',
            'education.gpa',
            'education.gpaScale',
            'education.rank',
            'education.researchArea',
            'employment.employer',
            'employment.title',
            'employment.description',
            'project.name',
            'project.role',
            'project.description',
            'project.url',
            'project.startDate',
            'project.endDate',
            'cv.skills',
            'cv.publications',
        ]:
            self.assertIn(key, content)
        self.assertIn('globalEducationValue', content)
        self.assertIn('packetEntryValue', content)
        self.assertIn('if (key.startsWith("education."))', content)
        self.assertIn('if (globalValue.handled && globalValue.value) return { value: globalValue.value, aliases: [] }', content)
        self.assertIn('const packetValue = packetEntryValue(packet, key, packetCounters)', content)


if __name__ == "__main__":
    unittest.main()
