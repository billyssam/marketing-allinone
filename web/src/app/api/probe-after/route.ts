import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { createServiceClient, isSupabaseConfigured } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * 인프라 프로브 — Vercel에서 after()가 응답 후에도 살아서 작업을 끝내는지 검증.
 * 웰컴 드래프트(온보딩 after 생성, 10~20초)가 프로덕션에서 잘리지 않음을 보장하는 근거.
 * 서비스롤 키를 아는 호출자만 사용 가능(외부 노출 무해 — 404로 위장).
 *
 * 사용: POST + 헤더 x-probe-key:<SERVICE_ROLE_KEY> → {marker} 즉시 반환
 *      → 15초 뒤 activity_log(event='after_probe', detail.marker) 행이 생기면 통과.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }
  if (req.headers.get('x-probe-key') !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const marker = crypto.randomUUID();
  const respondedAt = new Date().toISOString();

  after(async () => {
    // 웰컴 드래프트의 Gemini 지연(10~20초)을 흉내 — 15초 뒤에도 함수가 살아있는지
    await new Promise((r) => setTimeout(r, 15_000));
    const supabase = createServiceClient();
    await supabase.from('activity_log').insert({
      event: 'after_probe',
      detail: { marker, respondedAt, ranAt: new Date().toISOString() },
    });
  });

  return NextResponse.json({ ok: true, marker, respondedAt });
}
