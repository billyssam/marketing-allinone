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

test('enum 밖/판매·평판 채널은 제외(영속 불가)', () => {
  const ch = contentChannelsFor(['naver_place', 'danggeun', 'smartstore', 'baemin', 'kakao_alimtalk']);
  // naver_blog anchor만 남고 나머지는 enum 매핑 없어 제외
  assert.deepEqual(ch, ['naver_blog']);
});

test('중복 연결도 유일 채널로', () => {
  assert.deepEqual(contentChannelsFor(['naver_blog', 'naver_blog', 'instagram', 'instagram']).sort(), ['instagram', 'naver_blog']);
});

test('모든 CONTENT 채널이 유효한 post_channel enum으로 매핑', () => {
  const validEnum = new Set(['blog', 'instagram', 'facebook', 'google_gbp', 'threads']);
  for (const [, post] of Object.entries(CHANNEL_TO_POST)) {
    assert.ok(validEnum.has(post!), `${post} 는 유효 enum`);
  }
});
