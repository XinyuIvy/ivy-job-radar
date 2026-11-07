import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync('app/api/project-walkthrough/route.ts','utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/export /g, '')
  .replace('await import("cloudflare:workers")', 'runtime');
const javascript = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
function handler(signedIn, env) {
  return new Function('NextResponse','getChatGPTUser','runtime',javascript+'\nreturn GET;')(Response,async()=>signedIn?{email:'owner@example.test'}:null,{env});
}
const request = value => ({nextUrl:new URL('https://example.test/api/project-walkthrough?'+value)});

test('anonymous requests cannot reach D1 or R2',async()=>{
  const response=await handler(false,new Proxy({},{get(){throw Error('must not read env')}}))(request('view=jobs'));
  assert.equal(response.status,401);
});
test('unknown and inherited query names cannot select SQL',async()=>{
  for(const view of ['__proto__','constructor','jobs; DROP TABLE jobs']) {
    const response=await handler(true,{})(request('view='+encodeURIComponent(view)));
    assert.equal(response.status,400);
  }
});
test('live sample executes only a bounded fixed SELECT',async()=>{
  const statements=[];
  const response=await handler(true,{DB:{prepare(sql){statements.push(sql);return {all:async()=>({results:[{id:1}]})}}}})(request('view=jobs'));
  assert.equal(response.status,200);
  assert.equal(statements.length,1);
  assert.match(statements[0],/^SELECT .* LIMIT 5$/);
  assert.doesNotMatch(statements[0],/INSERT|UPDATE|DELETE|CREATE/);
  assert.deepEqual((await response.json()).rows,[{id:1}]);
});
test('vector viewer cannot read arbitrary keys or oversized objects',async()=>{
  let reads=0;
  const GET=handler(true,{BUCKET:{get:async()=>{reads++;return {size:2000001,text:async()=>{throw Error('must not load oversized body')}}}}});
  assert.equal((await GET(request('view=vectors&key=cv-prebuilds/private.pdf'))).status,400);
  assert.equal(reads,0);
  assert.equal((await GET(request('view=vectors&key=evidence-rag/abcdef/qwen3-embedding-0.6b/0.json'))).status,413);
  assert.equal(reads,1);
});
test('jobId filters use a bound value and reject invalid identifiers',async()=>{
  const seen=[];
  const GET=handler(true,{DB:{prepare(sql){seen.push(sql);return {bind(id){seen.push(id);return {all:async()=>({results:[]})}},all:async()=>({results:[]})}}}});
  assert.equal((await GET(request('view=cv&jobId=42'))).status,200);
  assert.match(seen[0],/WHERE job_id = \? ORDER BY/);
  assert.equal(seen[1],42);
  assert.equal((await GET(request('view=jobs&jobId=1%20OR%201=1'))).status,400);
  assert.equal((await GET(request('view=applications&jobId=42'))).status,400);
});
