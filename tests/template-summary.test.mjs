import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTemplateAutofillPacket} from '../app/lib/template-autofill-packet.ts';
const packet=latex=>buildTemplateAutofillPacket({archiveId:'TEMPLATE:test',templateFile:'test.tex',cvCommit:'test',latex});
test('selected template summary is preserved without borrowing later sections',()=>{
 const result=packet(String.raw`\section*{个人简介}
面向 AI Agent 岗位，使用 \textbf{Python} 和 SQL。
\section*{教育背景}
不应进入简介。`);
 assert.equal(result.summary,'面向 AI Agent 岗位，使用 Python 和 SQL。');
 assert.equal(result.source_cv.template_file,'test.tex');
 assert.equal(packet(String.raw`\section*{教育背景}不存在简介`).summary,'');
 assert.equal(packet(String.raw`\section*{个人简介}第一段\section*{Profile}第二段`).summary,'');
});
