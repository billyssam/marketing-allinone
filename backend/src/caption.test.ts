/** 캡션 플랫폼 트림 회귀 테스트. 실행: npx tsx --test src/caption.test.ts */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampCaption, clampForChannel, PLATFORM_MAX } from '../../shared/content-engine/caption.js';

test('한도 이하는 원문 유지', () => {
  const s = '짧은 캡션이에요. 그대로 둡니다.';
  assert.equal(clampCaption(s, 500), s);
});

test('초과 시 문장 경계에서 자른다(단어 중간 금지)', () => {
  const s = '첫 문장입니다. 두 번째 문장이에요. 세 번째는 잘려야 하는 아주 긴 문장으로 채웁니다.';
  const out = clampCaption(s, 30);
  assert.ok(out.length <= 30, `트림 길이 ${out.length}`);
  assert.ok(/[.!?…]$/.test(out), `문장부호로 끝: "${out}"`);
  assert.ok(!out.includes('세 번째는 잘려야'), '중간 문장 미포함');
});

test('문장부호 없으면 공백 경계 + 말줄임', () => {
  const s = '이건 문장부호가 전혀 없는 아주 긴 한 줄짜리 텍스트 예시 입니다 계속 이어집니다';
  const out = clampCaption(s, 20);
  assert.ok(out.length <= 21, `트림 ${out.length}`);
  assert.ok(!out.includes('  '), '중복 공백 없음');
});

test('threads 하드 리밋 500 적용', () => {
  const long = '가나다라마바사. '.repeat(60); // ~480자에 문장부호 다수
  const out = clampForChannel('threads', long);
  assert.ok(out.length <= PLATFORM_MAX.threads!, `threads ${out.length} <= 500`);
});

test('instagram은 넉넉(2200) — 500대 캡션은 안 자름', () => {
  const s = '가'.repeat(545);
  assert.equal(clampForChannel('instagram', s).length, 545, '인스타 545자 보존');
});

test('리밋 없는 채널은 원문', () => {
  const s = 'x'.repeat(9999);
  assert.equal(clampForChannel('naver_blog', s), s);
});

test('신규 4채널 전부 플랫폼 상한을 갖는다(무방비 발행 방지)', () => {
  // 채널을 열어놓고 상한을 안 걸면 긴 글이 그대로 나가 발행이 깨진다
  for (const ch of ['naver_place', 'danggeun', 'naver_band', 'kakao_channel'] as const) {
    assert.ok(typeof PLATFORM_MAX[ch] === 'number', `${ch} 상한 존재`);
    const long = '가나다라마바사아. '.repeat(400);
    assert.ok(clampForChannel(ch, long).length <= PLATFORM_MAX[ch]!, `${ch} 트림 적용`);
  }
});

test('카카오 채널은 알림 메시지라 가장 짧은 상한', () => {
  assert.ok(PLATFORM_MAX.kakao_channel! < PLATFORM_MAX.naver_band!, '채널메시지 < 밴드 게시글');
});
