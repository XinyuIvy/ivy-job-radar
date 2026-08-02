import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PendingJobVisibilitySourceTests(unittest.TestCase):
    def test_pending_applications_are_hidden_from_today_view_case_insensitively(self):
        component = (ROOT / "app" / "pending-job-visibility.tsx").read_text(encoding="utf-8")
        layout = (ROOT / "app" / "layout.tsx").read_text(encoding="utf-8")

        self.assertIn('row.status === "准备材料"', component)
        self.assertIn('toLocaleLowerCase()', component)
        self.assertIn('card.hidden = shouldHide', component)
        self.assertIn('<PendingJobVisibility />', layout)

    def test_application_post_deduplicates_case_insensitively(self):
        route = (ROOT / "app" / "api" / "applications" / "route.ts").read_text(encoding="utf-8")

        self.assertIn('normalize(row.company) === companyKey', route)
        self.assertIn('normalize(row.title) === titleKey', route)
        self.assertIn('row.applicationId.trim().toLocaleLowerCase()', route)
        self.assertIn('return NextResponse.json(duplicate, { status: 200 })', route)


if __name__ == "__main__":
    unittest.main()
