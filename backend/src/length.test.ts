/** 분량 지시 회귀 테스트. 실행: npx tsx --test src/length.test.ts */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lengthSpec, lengthDirective } from '../../shared/content-engine/length.js';

test('lengthSpec: 타깃별 최소 글자수·소제목 단조 증가', () => {
  const s = lengthSpec('short'), m = lengthSpec('medium'), l = lengthSpec('long');
  assert.ok(s.minChars < m.minChars && m.minChars < l.minChars, '글자수 short<medium<long');
  assert.equal(m.target, 'medium');
});

test('lengthSpec: 기본값 medium', () => {
  assert.equal(lengthSpec().minChars, lengthSpec('medium').minChars);
});

test('lengthDirective: 최소 글자수·소제목·문단 지시를 명령형으로 포함', () => {
  const d = lengthDirective('medium');
  assert.ok(d.includes('최소'), '최소 글자수 강제');
  assert.ok(/1,?600자/.test(d), 'medium 1600자 명시');
  assert.ok(d.includes('<h2>'), '소제목 개수 지시');
  assert.ok(d.includes('문단'), '문단 밀도 지시');
});

test('lengthDirective: long이 medium보다 많은 글자수를 요구', () => {
  assert.ok(/2,?200/.test(lengthDirective('long')), 'long 2200자');
  assert.ok(/700/.test(lengthDirective('short')), 'short 700자');
});
