/**
 * 연결 채널 → 콘텐츠 생성 채널 선택 회귀 테스트.
 * 실행: npx tsx --test src/content-channels.test.ts
 * 핵심: 채널을 연결하면 그 채널 글도 나온다 + enum 밖 채널은 조용히 제외(크래시 금지).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentChannelsFor, CHANNEL_TO_POST } from '../../shared/channels/registry.js';

test('블로그는 항상 anchor로 포함', () => {
  assert.deepEqual(contentChannelsFor([]), ['naver_blog']);
  assert.ok(contentChannelsFor(['instagram']).includes('naver_blog'));
});

test('연결된 콘텐츠 채널이 추가된다', () => {
  const ch = contentChannelsFor(['instagram', 'facebook', 'threads', 'google_business']);
  assert.ok(ch.includes('naver_blog'));
  assert.ok(ch.includes('instagram'));
  assert.ok(ch.includes('facebook'));
  assert.ok(ch.includes('threads'));
  assert.ok(ch.includes('google_business'));
});

test('플레이스·당근은 콘텐츠 채널로 포함(2026-07-27 확장)', () => {
  // 플레이스는 priority 1인데 매핑 누락으로 글이 한 번도 안 나왔던 결함을 수정한 계약
  const ch = contentChannelsFor(['naver_place', 'danggeun']);
  assert.ok(ch.includes('naver_place'), '플레이스 소식 생성 대상');
  assert.ok(ch.includes('danggeun'), '당근 동네홍보 생성 대상');
});

test('판매·재방문 채널은 콘텐츠 생성 대상이 아니다', () => {
  // 스토어·배달·알림톡은 글을 쓰는 자리가 아님 → anchor만 남아야
  const ch = contentChannelsFor(['smartstore', 'baemin', 'kakao_alimtalk', 'coupang']);
  assert.deepEqual(ch, ['naver_blog']);
});

test('중복 연결도 유일 채널로', () => {
  assert.deepEqual(contentChannelsFor(['naver_blog', 'naver_blog', 'instagram', 'instagram']).sort(), ['instagram', 'naver_blog']);
});

test('모든 CONTENT 채널이 유효한 post_channel enum으로 매핑', () => {
  // 0005 마이그레이션 후 DB enum과 일치해야 하는 목록(코드-스키마 계약)
  const validEnum = new Set([
    'blog', 'instagram', 'facebook', 'google_gbp', 'threads',
    'naver_place', 'danggeun', 'naver_band', 'kakao_channel',
  ]);
  for (const [, post] of Object.entries(CHANNEL_TO_POST)) {
    assert.ok(validEnum.has(post!), `${post} 는 유효 enum`);
  }
});
