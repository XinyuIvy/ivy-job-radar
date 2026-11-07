import { NextRequest, NextResponse } from 'next/server';
import { deriveBookmarkCaptureKey, secureBookmarkKeyEqual } from '../../../lib/bookmark-capture';
import { compressCvDescription, DEFAULT_AUTOFILL_MODEL } from '../../../lib/deepseek-autofill';
export const dynamic = 'force-dynamic';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'X-Ivy-Autofill-Key, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store' };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers }); }
export async function POST(request: NextRequest) {
  const { env } = await import('cloudflare:workers');
  const expected = await deriveBookmarkCaptureKey(String(env.IVY_JOB_RADAR_SYNC_TOKEN || '').trim());
  if (!expected || !secureBookmarkKeyEqual(expected, request.headers.get('x-ivy-autofill-key') || '')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  const apiKey = String(env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) return NextResponse.json({ error: '服务端尚未配置 DEEPSEEK_API_KEY，未压缩或截断原文。' }, { status: 503, headers });
  try {
    const raw = await request.text();
    if (raw.length > 20000) return NextResponse.json({ error: '请求过长' }, { status: 413, headers });
    const body = JSON.parse(raw);
    if (!['employment', 'project'].includes(body.module)) throw new Error('INVALID_MODULE');
    const model = String(env.DEEPSEEK_AUTOFILL_MODEL || DEFAULT_AUTOFILL_MODEL);
    const text = await compressCvDescription(apiKey, body.source, body.limit, model);
    return NextResponse.json({ text, model, provider: 'deepseek' }, { headers });
  } catch { return NextResponse.json({ error: 'DeepSeek 压缩失败或结果未通过校验；保留原文，未强行截断。' }, { status: 422, headers }); }
}
