from pathlib import Path

root = Path(__file__).resolve().parents[1]
helper_path = root / "app" / "lib" / "application-archive.ts"
test_path = root / "tests" / "test_application_archive_source.py"

helper = helper_path.read_text(encoding="utf-8")

flag_old = '''    "  automatic_pdf_compilation_authorized: true",\n    "  manual_binary_pdf_upload_by_chat_authorized: false",\n    "  application_status_mutation_authorized: false",'''
flag_new = '''    "  automatic_pdf_compilation_authorized: true",\n    "  manual_binary_pdf_upload_by_chat_authorized: false",\n    "  local_chat_pdf_preview_authorized: true",\n    "  local_preview_repository_write_authorized: false",\n    "  application_status_mutation_authorized: false",'''
if flag_old not in helper:
    raise SystemExit("Application record PDF flags block not found")
helper = helper.replace(flag_old, flag_new, 1)

const_old = '''  const customizedTex = `cv_customized_${archiveId}.tex`;\n  const customizedPdf = `cv_customized_${archiveId}.pdf`;\n  const submittedPdf = `cv_submitted_${archiveId}.pdf`;'''
const_new = '''  const customizedTex = `cv_customized_${archiveId}.tex`;\n  const customizedPdf = `cv_customized_${archiveId}.pdf`;\n  const customizedText = `cv_customized_${archiveId}.txt`;\n  const buildManifest = `cv_build_manifest_${archiveId}.json`;\n  const submittedPdf = `cv_submitted_${archiveId}.pdf`;'''
if const_old not in helper:
    raise SystemExit("Customized CV filename constants block not found")
helper = helper.replace(const_old, const_new, 1)

start_marker = "完成分类审核后，不要修改 TeX。先给我纯文本内容方案"
end_marker = "现在只执行读取、独立分类审核和第一版纯文本内容建议，完成后停下来等我确认。"
start = helper.find(start_marker)
end = helper.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("Prompt tail markers not found")
end += len(end_marker)

replacement = r'''完成分类审核后，先给我纯文本内容方案，包括：summary、skills、经历或项目选择、项目顺序、每条 bullet、关键词覆盖和需要删减的内容。我们在 Chat 里逐条调整。默认先以文本为主；如果我明确要求“看一下 PDF / 预览 PDF”，即使内容还没有完全定稿，也允许你基于当前草稿在 Chat 自己的临时工作区创建一个本地 TeX 工作副本并编译预览 PDF，但这只是预览，不能写入任何仓库。

在我确认内容定稿之前：

- 不把 application-specific TeX 写入 GitHub
- 不把任何预览 PDF 写入 GitHub
- 不改变申请状态
- 除非我明确要求看 PDF，否则继续用纯文本讨论内容

当我说“内容定稿”或明确要求查看 PDF 后，可以从 \`cv_base.tex\` 在 Chat 的本地临时工作区创建本申请的工作 TeX。工作 TeX 必须保持母版的 document class、packages、字体、字号、页边距、section 样式、bullet 样式、行距、项目间距、联系方式格式、日期和地点排版、\`\\hfill\` 规则及全部自定义命令。可以调整文字和项目顺序，但不得重新设计版式，也不得通过明显缩小字体强行塞进两页。

### Chat 内 PDF 预览规则

1. 在根 Chat 中需要查看版式时，直接在本地工作区用 XeLaTeX 编译当前工作 TeX，生成临时预览 PDF。预览文件不要写入申请归档仓库。
2. 每次涉及 wording、项目顺序、分页、间距或可能改变行数的修改后，如果我正在看 PDF，就重新编译最新预览。
3. 检查预览 PDF 不超过两页、无明显溢出或异常断行、文本可提取。不要只告诉我“编译成功”；要把生成的预览 PDF 作为 Chat 中可打开的文件或链接直接给我看。
4. 如果本地编译环境暂时不可用，明确告诉我缺少什么，不要改成通过 GitHub connector 读取或上传二进制 PDF 来冒充预览。
5. GitHub connector 不能可靠读取二进制 PDF 内容，所以聊天阶段的视觉检查以 Chat 本地编译出的预览 PDF 为准；GitHub 中的 PDF 是归档产物，不是唯一的查看方式。

我们可以根据预览 PDF 继续修改内容或版式并反复编译。只有当我明确说“PDF定稿”“最终版确认”或同等明确措辞后，才把最终工作 TeX 保存为 \`${customizedTex}\` 并写入本申请目录。文件名必须保留完整 application ID，不得简化为 \`cv_customized.tex\` 或其他不带 application ID 的名称。

提交 \`${customizedTex}\` 到 \`${ARCHIVE_REPOSITORY}\` 的 \`main\` 后，会自动触发 GitHub Actions 中的 \`Build customized CV PDF\` workflow。不要在 Chat 中把 PDF 二进制重新编码成 base64、分块传输，或通过 GitHub connector 手动上传 PDF。

workflow 会调用仓库的 \`scripts/build_cv.sh\`，使用 XeLaTeX 生成并验证 \`${customizedPdf}\`，同时保存 \`${customizedText}\` 和 \`${buildManifest}\`。其中：

- \`${customizedPdf}\` 是归档 PDF；
- \`${customizedText}\` 是从最终 PDF 提取出的 UTF-8 文本，供其他 Chat / GitHub 文本连接读取；
- \`${buildManifest}\` 记录页数、ATS 文本提取状态、源文件/输出文件名和 SHA-256，用于确认最终 PDF 与 TeX 对应。

提交 TeX 后检查并等待该 GitHub Action 完成。如果 workflow 失败，读取失败步骤或日志，修正本地工作 TeX、重新给我预览，并在我确认后再提交修正版；在 workflow 成功且这些归档文件确实存在之前，不得声称归档 PDF 已成功生成。

GitHub Action 成功后，读取 \`${customizedText}\` 和 \`${buildManifest}\` 核对最终归档内容及页数。若我还要在根 Chat 里再次看最终版式，用已提交的同一份 \`${customizedTex}\` 在 Chat 本地重新编译并把 PDF 直接给我看；不要尝试通过 GitHub connector 直接读取 binary PDF 内容。

最终仍需经过我的确认。在我明确确认实际投递版本之前，不创建 \`${submittedPdf}\`。不得修改其他申请，也不得覆盖 \`XinyuIvy/CV\` 中的行业母版。

现在只执行读取、独立分类审核和第一版纯文本内容建议，完成后停下来等我确认。'''
helper = helper[:start] + replacement + helper[end:]
helper_path.write_text(helper, encoding="utf-8")

tests = test_path.read_text(encoding="utf-8")
needle = '''    def test_existing_archive_gets_current_operational_prompt_without_rewriting_snapshot(self):\n'''
new_test = r'''    def test_prompt_allows_local_pdf_preview_before_archive_write(self):
        helper = (ROOT / "app" / "lib" / "application-archive.ts").read_text(encoding="utf-8")
        for phrase in [
            "local_chat_pdf_preview_authorized: true",
            "local_preview_repository_write_authorized: false",
            "Chat 内 PDF 预览规则",
            "不要只告诉我“编译成功”",
            "PDF定稿",
            "GitHub connector 不能可靠读取二进制 PDF 内容",
            "cv_customized_${archiveId}.txt",
            "cv_build_manifest_${archiveId}.json",
        ]:
            self.assertIn(phrase, helper)

'''
if needle not in tests:
    raise SystemExit("Test insertion point not found")
tests = tests.replace(needle, new_test + needle, 1)
test_path.write_text(tests, encoding="utf-8")
