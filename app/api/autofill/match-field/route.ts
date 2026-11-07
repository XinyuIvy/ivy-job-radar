import { NextRequest, NextResponse } from 'next/server';
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from '../../../lib/bookmark-capture';
import { matchCvField, matchCvModule, DEFAULT_AUTOFILL_MODEL } from '../../../lib/deepseek-autofill';
export const dynamic = 'force-dynamic';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'X-Ivy-Autofill-Key, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers }); }
export async function POST(request: NextRequest) {
  const { env } = await import('cloudflare:workers');
  const expected = await deriveBookmarkCaptureKey(String(env.IVY_JOB_RADAR_SYNC_TOKEN || '').trim());
  if (!expected || !secureBookmarkKeyEqual(expected, request.headers.get('x-ivy-autofill-key') || '')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  if (!env.DEEPSEEK_API_KEY) return NextResponse.json({ error: 'DeepSeek 尚未配置' }, { status: 503, headers });
  try {
    const raw = await request.text();if(raw.length > 48000)throw new Error('TOO_LARGE');
    const { kind, module, label, sourceKeys, candidates, structure } = JSON.parse(raw);
    const model = String(env.DEEPSEEK_AUTOFILL_MODEL || DEFAULT_AUTOFILL_MODEL);
    const result = kind === 'module'
      ? await matchCvModule(String(env.DEEPSEEK_API_KEY), label, candidates, structure, model)
      : await matchCvField(String(env.DEEPSEEK_API_KEY), module, label, sourceKeys, model);
    return NextResponse.json(result, { headers });
  } catch { return NextResponse.json({ error: '新字段匹配失败，未猜填' }, { status: 422, headers }); }
}
