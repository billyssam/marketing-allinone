#!/usr/bin/env node
/**
 * Supabase 복구 검증 — 새 프로젝트 키를 web/.env.local에 넣은 뒤 한 방에 확인.
 *   node scripts/verify-db.mjs
 * 검사: DNS/도달성 → 서비스키 인증 → 핵심 테이블 5개 → industries 시드 → channel_connections.channel_id(0003).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, 'web/.env.local');

let raw;
try {
  raw = readFileSync(envPath, 'utf8');
} catch {
  fail(`web/.env.local 이 없습니다 (${envPath})`);
}
const env = Object.fromEntries(
  raw.replace(/^﻿/, '') // BOM 제거(첫 키 이름 오염 방지)
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      const k = l.slice(0, i).trim();
      // 값 양끝 따옴표 제거(KEY="..." / KEY='...' 형태 지원)
      const v = l.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
      return [k, v];
    }),
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !SERVICE || !ANON) fail('키 누락: NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY 셋 다 필요');

const TABLES = ['industries', 'stores', 'channel_connections', 'posts', 'reviews'];
let ok = 0, bad = 0;

async function rest(path, key) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
  });
  return res;
}

console.log(`Supabase: ${URL_}\n`);

// 1) 도달성 — NXDOMAIN(삭제/미존재)은 fetch가 throw, pause/중단은 DNS는 살아도 5xx 반환
try {
  const res = await rest('', SERVICE);
  if (res.status >= 500) {
    fail(`프로젝트가 응답했지만 HTTP ${res.status} — pause/중단 상태로 보입니다. 대시보드에서 Restore 후 재시도.`);
  }
  if (res.status === 401 || res.status === 403) {
    fail(`프로젝트 도달했으나 인증 거부(HTTP ${res.status}) — SERVICE_ROLE_KEY가 이 프로젝트 것이 맞는지 확인.`);
  }
  pass('프로젝트 도달 (DNS/HTTPS OK)');
} catch (e) {
  fail(`프로젝트 도달 실패 — URL이 틀렸거나 프로젝트가 삭제/미존재(NXDOMAIN): ${e.cause?.code ?? e.message}`);
}

// 2) 테이블 존재
for (const t of TABLES) {
  const res = await rest(`${t}?select=*&limit=1`, SERVICE);
  if (res.ok) pass(`테이블 ${t}`);
  else warn(`테이블 ${t} → HTTP ${res.status} (${(await res.text()).slice(0, 80)})`);
}

// 3) industries 시드 3종
{
  const res = await rest('industries?select=id', SERVICE);
  const rows = res.ok ? await res.json() : [];
  const have = new Set(rows.map((r) => r.id));
  const need = ['cafe', 'restaurant', 'vet'];
  if (need.every((n) => have.has(n))) pass(`industries 시드 (${[...have].join(', ')})`);
  else warn(`industries 시드 부족 — 현재 [${[...have].join(', ')}], 필요 [${need.join(', ')}] → schema-all.sql 재실행`);
}

// 4) 0003 적용 여부 (channel_id 컬럼)
{
  const res = await rest('channel_connections?select=channel_id&limit=1', SERVICE);
  if (res.ok) pass('0003 적용됨 (channel_connections.channel_id)');
  else warn('0003 미적용 — channel_id 컬럼 없음. schema-all.sql 하단 0003 블록 실행 필요');
}

// 5) anon 키도 살아있는지
{
  const res = await rest('industries?select=id&limit=1', ANON);
  if (res.ok) pass('anon 키 정상');
  else warn(`anon 키 이상 → HTTP ${res.status}`);
}

console.log(`\n결과: ✅ ${ok}  ⚠️ ${bad}`);
if (bad === 0) console.log('복구 완료! 이제 `npm run dev --prefix web` 후 로그인→온보딩→글 생성이 가능합니다.');
process.exit(bad === 0 ? 0 : 1);

function pass(m) { ok++; console.log(`  ✅ ${m}`); }
function warn(m) { bad++; console.log(`  ⚠️ ${m}`); }
function fail(m) { console.error(`  ❌ ${m}`); process.exit(1); }
