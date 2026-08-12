/**
 * 넛지 화면 검증용 일회용 계정/매장 — 만들고 확인한 뒤 반드시 지운다.
 *
 * 실제 파일럿 매장은 판매 항목이 이미 차 있어 넛지 조건을 못 만든다.
 * 크론이 이 매장을 물지 않도록 확인 즉시 삭제한다(--drop).
 *
 * 사용법:
 *   npx tsx src/probe-nudge.ts --create   → 이메일/비밀번호 출력
 *   npx tsx src/probe-nudge.ts --drop     → 흔적 전부 삭제
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: resolve(process.cwd(), '../web/.env.local'), quiet: true });
loadEnv({ quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

const EMAIL = 'probe-nudge@example.com';
const PASSWORD = 'probe-nudge-8912!';
const STORE = '넛지검증매장';

async function drop() {
  const { data: stores } = await supabase.from('stores').select('id').eq('name', STORE);
  for (const s of stores ?? []) {
    await supabase.from('posts').delete().eq('store_id', s.id);
    await supabase.from('channel_connections').delete().eq('store_id', s.id);
    await supabase.from('stores').delete().eq('id', s.id);
  }
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const u of list?.users ?? []) if (u.email === EMAIL) await supabase.auth.admin.deleteUser(u.id);
  console.log(`정리 완료 — 매장 ${stores?.length ?? 0}곳, 계정 ${EMAIL}`);
}

async function create() {
  await drop();
  const { data: created, error } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !created?.user) throw new Error(`계정 생성 실패: ${error?.message}`);

  // 기본은 미용실 — 플레이스 없음·항목 0. 수정 전이라면 아무 안내도 못 받던 32곳의 대표
  const { error: se } = await supabase.from('stores').insert({
    owner_id: created.user.id,
    name: STORE,
    industry_id: 'hair',
    naver_place_url: null,
    brand_tone: {},
    onboarded_at: new Date().toISOString(),
  });
  if (se) throw new Error(`매장 생성 실패: ${se.message}`);
  console.log(`${EMAIL}\n${PASSWORD}`);
}

/** 업종만 바꿔 다른 넛지 조건을 만든다(온라인 셀러 → 플레이스를 조르면 안 되는 쪽) */
async function setIndustry(id: string) {
  const { error } = await supabase.from('stores').update({ industry_id: id }).eq('name', STORE);
  if (error) throw new Error(error.message);
  console.log(`업종 변경 → ${id}`);
}

const industryArg = process.argv.find((a) => a.startsWith('--industry='));
const mode = process.argv.includes('--drop') ? 'drop' : industryArg ? 'industry' : 'create';
const run = mode === 'drop' ? drop() : mode === 'industry' ? setIndustry(industryArg!.split('=')[1]) : create();
run.catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
