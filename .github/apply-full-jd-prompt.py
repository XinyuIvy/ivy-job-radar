from pathlib import Path

root = Path(__file__).resolve().parents[1]

helper_path = root / "app" / "lib" / "application-archive.ts"
route_path = root / "app" / "api" / "cv-tailor" / "archive" / "route.ts"
test_path = root / "tests" / "test_application_archive_source.py"

helper = helper_path.read_text(encoding="utf-8")
if "BEGIN CONFIRMED FULL JD" not in helper:
    helper = helper.replace(
        "export function buildChatPrompt(archiveId: string, path: string) {",
        "export function buildChatPrompt(archiveId: string, path: string, fullJd: string) {",
    )
    helper = helper.replace(
        "  const submittedPdf = `cv_submitted_${archiveId}.pdf`;\n\n  return `请为申请",
        "  const submittedPdf = `cv_submitted_${archiveId}.pdf`;\n  const confirmedFullJd = fullJd.trim();\n\n  return `请为申请",
    )
    helper = helper.replace(
        "\\`${path}/\\`\n\n首先只读取以下申请输入：",
        "\\`${path}/\\`\n\n## 完整 JD 是本次定制的主输入\n\n下面已经直接内嵌了你在 Job Radar 中确认并冻结的完整 JD 原文。必须把它从头到尾作为一级输入阅读，不能只看 Job Radar 抽取出的几条 requirement / fact。随后再打开 \\`jd_snapshot.md\\`，从第一行读到文件结尾并核对它与下方完整 JD 是否一致；如果 GitHub/connector 返回内容被截断，继续分段读取直到 EOF。若两者不一致，立即停止并告诉我，不要自行选择其中一版。\n\n----- BEGIN CONFIRMED FULL JD -----\n${confirmedFullJd}\n----- END CONFIRMED FULL JD -----\n\n完成完整 JD 核对后，再读取以下申请输入：",
    )
    helper = helper.replace(
        "\\`match_packet.json\\` 只是 Job Radar 的初步分类，不是最终结论。请读取完整 JD、完整事实母版、canonical indexes 和当前 CV，独立审核每项 JD 要求属于 Direct、Transferable、Adjacent 还是 Unsupported。你可以纠正、补充或推翻 Job Radar 的分类，但必须说明事实依据。",
        "\\`jd_snapshot.md\\` 与上面内嵌的完整 JD 是岗位要求的主权威来源。\\`jd_requirements.json\\` 和 \\`match_packet.json\\` 都只是从完整 JD 派生出的结构化摘要，绝对不能替代完整 JD，也不能把分析范围限制在其中已经抽取的几条要求。不要只根据 \\`jd_requirements.json\\` 里的几条 fact / requirement 做匹配。必须自行从完整 JD 中识别所有职责、必需条件、优先条件、学历/经验、方法与工具、合作与沟通要求、工作授权/地点/工作方式以及其他会影响 CV 的信息；即使某项没有出现在结构化摘要里，也要纳入审核。\n\n\\`match_packet.json\\` 只是 Job Radar 的初步分类，不是最终结论。请在完整阅读 JD 后，再结合完整事实母版、canonical indexes 和当前 CV，独立审核每项 JD 要求属于 Direct、Transferable、Adjacent 还是 Unsupported。你可以纠正、补充或推翻 Job Radar 的分类，但必须说明事实依据。",
    )
    helper = helper.replace(
        "现在只执行读取、独立分类审核和第一版纯文本内容建议，完成后停下来等我确认。",
        "现在只执行完整 JD 核对、独立分类审核和第一版纯文本内容建议，完成后停下来等我确认。第一版分析必须体现完整 JD 的全部主要板块，而不是只复述 jd_requirements.json / match_packet.json 中已经抽出的条目。",
    )
    helper_path.write_text(helper, encoding="utf-8")

route = route_path.read_text(encoding="utf-8")
if "existingArchiveTextFile" not in route:
    old = '''async function existingArchivePrompt(apiRoot: string, path: string, token: string) {
  const response = await fetch(`${apiRoot}/contents/${path}/chat_prompt.txt?ref=main`, {
    cache: "no-store",
    headers: githubHeaders(token),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`GitHub ${response.status}: ${(await response.text()).slice(0, 600)}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const payload = await response.json() as { content?: string; encoding?: string };
  return payload.encoding === "base64" && payload.content ? decodeBase64Utf8(payload.content) : null;
}
'''
    new = '''async function existingArchiveTextFile(apiRoot: string, path: string, filename: string, token: string) {
  const response = await fetch(`${apiRoot}/contents/${path}/${filename}?ref=main`, {
    cache: "no-store",
    headers: githubHeaders(token),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`GitHub ${response.status}: ${(await response.text()).slice(0, 600)}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const payload = await response.json() as { content?: string; encoding?: string };
  return payload.encoding === "base64" && payload.content ? decodeBase64Utf8(payload.content) : null;
}

function fullJdFromSnapshot(snapshot: string) {
  const firstSectionBreak = snapshot.indexOf("\\n\\n");
  return (firstSectionBreak >= 0 ? snapshot.slice(firstSectionBreak + 2) : snapshot).trim();
}
'''
    if old not in route:
        raise SystemExit("existingArchivePrompt block not found")
    route = route.replace(old, new)
    route = route.replace(
        "    const existingPrompt = await existingArchivePrompt(archiveApiRoot, path, archiveToken);\n    if (existingPrompt) {\n      const currentPrompt = buildChatPrompt(archiveId, path);",
        "    const existingPrompt = await existingArchiveTextFile(archiveApiRoot, path, \"chat_prompt.txt\", archiveToken);\n    if (existingPrompt) {\n      const existingJdSnapshot = await existingArchiveTextFile(archiveApiRoot, path, \"jd_snapshot.md\", archiveToken);\n      if (!existingJdSnapshot) throw new Error(`Existing application archive ${archiveId} is missing jd_snapshot.md.`);\n      const currentPrompt = buildChatPrompt(archiveId, path, fullJdFromSnapshot(existingJdSnapshot));",
    )
    route = route.replace(
        "    const prompt = buildChatPrompt(archiveId, path);",
        "    const prompt = buildChatPrompt(archiveId, path, jd);",
    )
    route_path.write_text(route, encoding="utf-8")

test = test_path.read_text(encoding="utf-8")
if "test_prompt_embeds_complete_confirmed_jd" not in test:
    test = test.replace(
        '        self.assertIn("const existingPrompt = await existingArchivePrompt", route)\n        self.assertIn("const currentPrompt = buildChatPrompt(archiveId, path)", route)',
        '        self.assertIn("const existingPrompt = await existingArchiveTextFile", route)\n        self.assertIn("jd_snapshot.md", route)\n        self.assertIn("const currentPrompt = buildChatPrompt(archiveId, path, fullJdFromSnapshot(existingJdSnapshot))", route)',
    )
    marker = '    def test_archive_stops_when_private_repo_is_missing(self):\n'
    block = '''    def test_prompt_embeds_complete_confirmed_jd_and_treats_summaries_as_secondary(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        route = (ROOT / "app" / "api" / "cv-tailor" / "archive" / "route.ts").read_text(encoding="utf-8")
        for phrase in [
            "完整 JD 是本次定制的主输入",
            "BEGIN CONFIRMED FULL JD",
            "END CONFIRMED FULL JD",
            "${confirmedFullJd}",
            "如果 GitHub/connector 返回内容被截断，继续分段读取直到 EOF",
            "绝对不能替代完整 JD",
            "不要只根据 \\`jd_requirements.json\\` 里的几条 fact / requirement 做匹配",
            "完整 JD 的全部主要板块",
        ]:
            self.assertIn(phrase, helper)
        self.assertIn("buildChatPrompt(archiveId, path, jd)", route)
        self.assertIn('existingArchiveTextFile(archiveApiRoot, path, "jd_snapshot.md", archiveToken)', route)
        self.assertIn("fullJdFromSnapshot(existingJdSnapshot)", route)

'''
    if marker not in test:
        raise SystemExit("test insertion marker not found")
    test = test.replace(marker, block + marker)
    test_path.write_text(test, encoding="utf-8")
