import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * 24/7 운영 헬스체크 — 외부 uptime 크론이 매일 두드린다.
 * DB 연결까지 실제로 확인(단순 200이 아니라 서비스가 "살아서 일할 수 있는" 상태인지).
 * 내부 수치는 노출하지 않고 불리언만 반환.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  let db = false;
  try {
    const admin = createServiceClient();
    // 가장 가벼운 실쿼리 — 참조 테이블 head 카운트 (데이터 미노출)
    const { error } = await admin.from('industries').select('id', { head: true, count: 'exact' });
    db = !error;
  } catch {
    db = false;
  }
  const ok = db;
  return NextResponse.json(
    { ok, db, ts: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
