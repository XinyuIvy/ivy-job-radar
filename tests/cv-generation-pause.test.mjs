import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

for (const route of ['prepare','queue','chat','regenerate-pending']) {
  test(`${route} refuses generation before parsing inputs or invoking downstream services`,async()=>{
    const source=readFileSync(`app/api/cv-prebuild/${route}/route.ts`,'utf8')
      .replace(/^import [\s\S]*? from "[^"]+";\n/gm,'')
      .replace(/export /g,'')
      .replaceAll('await import("cloudflare:workers")','runtime');
    const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const POST=new Function('NextResponse','getChatGPTUser','CV_PREBUILD_AUTOMATION_PAUSED','CV_AUTOMATION_PAUSED_PAYLOAD','runtime',js+'\nreturn POST;')(Response,async()=>({email:'owner@example.test'}),true,{code:'CV_AUTOMATION_PAUSED'},{env:{}});
    const response=await POST({headers:new Headers(),json(){throw Error('must stop before reading generation inputs')}});
    assert.equal(response.status,503);
    assert.equal((await response.json()).code,'CV_AUTOMATION_PAUSED');
  });
}
