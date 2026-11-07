import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class BookmarkCaptureSourceTests(unittest.TestCase):
    def test_capture_endpoint_bypasses_verification_and_deduplicates(self):
        route = (ROOT / "app" / "api" / "bookmark-capture" / "route.ts").read_text(encoding="utf-8")

        self.assertIn('source: BOOKMARK_CAPTURE_SOURCE', route)
        self.assertIn('status: BOOKMARK_CAPTURE_STATUS', route)
        self.assertIn('eq(jobs.canonicalUrl, canonicalUrl)', route)
        self.assertIn('eq(jobs.applicationId, applicationId)', route)
        self.assertIn('deriveAmbiguousCaptureId', route)
        self.assertIn('description: description || captureId', route)
        self.assertIn('resolveBookmarkCaptureFields({', route)
        self.assertIn('sourcePageTitle,', route)
        self.assertIn('confirmedFields: body.confirmedFields', route)
        self.assertIn('applicationId,', route)
        self.assertIn('db.update(jobs)', route)
        self.assertIn('db.insert(jobs)', route)
        self.assertIn('db.delete(ignoredJobs)', route)
        self.assertIn('const saved = await saveJob', route)
        self.assertNotIn('verifyJob(', route)
        self.assertNotIn('jobRequests', route)

    def test_bookmarklet_extracts_jobposting_and_opens_independent_capture(self):
        installer = (ROOT / "app" / "bookmarklet" / "bookmarklet-installer.tsx").read_text(encoding="utf-8")

        self.assertIn('application/ld+json', installer)
        self.assertIn('type==="JobPosting"', installer)
        self.assertIn('/bookmarklet/capture', installer)
        self.assertIn('window.open(captureUrl.href,popupName', installer)
        self.assertIn('popup.postMessage({type:"ivy-job-radar-capture",payload}', installer)
        self.assertIn('event.origin!==captureUrl.origin', installer)
        self.assertIn('window.location.href', installer)
        self.assertIn('hiringOrganization', installer)
        self.assertIn('const captureId=', installer)
        self.assertIn('bookmarkVersion:"v10"', installer)
        self.assertIn('＋ 保存岗位', installer)
        self.assertIn('[class*="detail-title"]', installer)
        self.assertIn('[class*="post-content-desc"]', installer)
        self.assertIn('jobPostingDescription', installer)
        self.assertIn('const jdSignals=', installer)
        self.assertIn('const popupName="ivy_job_radar_capture_"+captureId', installer)
        self.assertIn('retryTimer=setInterval', installer)
        self.assertIn('roleHeading', installer)
        self.assertIn('titleCandidates', installer)
        self.assertIn('companyCandidates', installer)
        self.assertIn('[data-automation-id="jobPostingTitle"]', installer)
        self.assertNotIn("'[data-automation-id=\"jobPostingHeader\"]'", installer)
        self.assertNotIn('encodeURIComponent(JSON.stringify(payload))', installer)

    def test_cross_site_capture_transport_survives_chatgpt_sign_in(self):
        route = (ROOT / "app" / "api" / "bookmark-capture" / "session" / "route.ts").read_text(encoding="utf-8")
        capture_page = (ROOT / "app" / "bookmarklet" / "capture" / "page.tsx").read_text(encoding="utf-8")

        self.assertIn('request.formData()', route)
        self.assertIn('export async function GET(request: NextRequest)', route)
        self.assertIn('/bookmarklet/capture?transport=auth-retry', route)
        self.assertIn('sessionStorage.setItem', route)
        self.assertIn('window.sessionStorage.getItem(CAPTURE_PAYLOAD_STORAGE_KEY)', capture_page)
        self.assertIn('window.sessionStorage.removeItem(CAPTURE_PAYLOAD_STORAGE_KEY)', capture_page)
        self.assertIn('new URLSearchParams(window.location.hash.slice(1)).get("payload")', capture_page)
        self.assertIn('transport === "auth-retry"', capture_page)
        self.assertIn('ChatGPT 登录已经完成', capture_page)

    def test_baidu_capture_has_server_side_fallback(self):
        route = (ROOT / "app" / "api" / "bookmark-capture" / "route.ts").read_text(encoding="utf-8")
        capture_page = (ROOT / "app" / "bookmarklet" / "capture" / "page.tsx").read_text(encoding="utf-8")

        self.assertIn('resolveBaiduTalentPage', route)
        self.assertIn('parseBaiduTalentJobHtml', route)
        self.assertIn('body.previewOnly === true', route)
        self.assertIn('hostname === "talent.baidu.com"', capture_page)
        self.assertIn('previewOnly: true', capture_page)

    def test_capture_window_isolates_each_popup_and_posts_generated_identity(self):
        capture_page = (ROOT / "app" / "bookmarklet" / "capture" / "page.tsx").read_text(encoding="utf-8")

        self.assertIn('event.source !== window.opener', capture_page)
        self.assertIn('event.data?.type !== "ivy-job-radar-capture"', capture_page)
        self.assertNotIn('JSON.stringify({ jobId: result.jobId })', capture_page)
        self.assertIn('不会创建或调用 CV 生成任务', capture_page)
        self.assertIn('postMessage("ivy-job-radar-ready", "*")', capture_page)
        self.assertIn('fetch("/api/bookmark-capture"', capture_page)
        self.assertIn('fetch("/api/applications"', capture_page)
        self.assertIn('mergeDuplicate: true', capture_page)
        self.assertNotIn('method: "PUT"', capture_page)
        self.assertIn('保存到待申请', capture_page)
        self.assertIn('保存到已申请', capture_page)
        self.assertIn('fetchCvTemplateCatalog', capture_page)
        self.assertIn('TEMPLATE_STORAGE_KEY', capture_page)
        self.assertIn('option.filename', capture_page)
        self.assertNotIn('/api/applications/pending-action', capture_page)
        self.assertNotIn('/api/application-archive/ensure', capture_page)
        self.assertIn('"Content-Type": "application/json"', capture_page)
        self.assertIn('确认并保存岗位', capture_page)
        self.assertIn('confirmedFields: true', capture_page)
        self.assertIn('请快速确认公司、岗位和 JD', capture_page)
        self.assertIn('核心 JD 预览', capture_page)
        self.assertIn('extractCoreJobDescription', capture_page)
        self.assertIn('window.location.hash.slice(1)', capture_page)

    def test_campus_portals_infer_real_company_and_china_region(self):
        helpers = (ROOT / "app" / "lib" / "bookmark-capture.ts").read_text(encoding="utf-8")

        self.assertIn('["qq.com", "腾讯"]', helpers)
        self.assertIn('["alibaba.com", "阿里巴巴"]', helpers)
        self.assertIn('portalTitleCompany', helpers)
        self.assertIn('genericCompanyLabel', helpers)
        self.assertIn('KNOWN_COMPANY_HOSTS.some', helpers)
        self.assertIn('RECRUITING_PLATFORM_LABEL', helpers)
        self.assertIn('resolveBookmarkCaptureFields', helpers)

    def test_install_entry_and_scoped_key_are_present(self):
        layout = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")
        helpers = (ROOT / "app" / "lib" / "bookmark-capture.ts").read_text(encoding="utf-8")

        self.assertIn('href="/bookmarklet"', layout)
        self.assertIn('BOOKMARK_CAPTURE_STATUS = "开放"', helpers)
        self.assertIn('ivy-job-radar-bookmark-v1:', helpers)
        self.assertIn('secureBookmarkKeyEqual', helpers)
        installer = (ROOT / "app" / "bookmarklet" / "bookmarklet-installer.tsx").read_text(encoding="utf-8")
        self.assertNotIn('IVY_JOB_RADAR_SYNC_TOKEN', installer)


if __name__ == "__main__":
    unittest.main()
