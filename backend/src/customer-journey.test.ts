import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generationFailure } from '../../shared/generation-error';
import { bounded, devicePushEnabled } from '../../shared/push-state';
import { plainTextHtml } from '../../shared/post-edit';
import { readinessOf } from '../../shared/channels/readiness';

test('기기 구독만 있고 서버 저장이 실패한 알림은 켜짐이 아니다', () => {
  assert.equal(devicePushEnabled('device-a', [], true), false);
  assert.equal(devicePushEnabled('device-a', ['device-b'], true), false);
});
test('서버·기기 구독이 같고 권한이 허용된 경우만 켜짐이다', () => {
  assert.equal(devicePushEnabled('device-a', ['device-a'], true), true);
  assert.equal(devicePushEnabled('device-a', ['device-a'], false), false);
  assert.equal(devicePushEnabled(undefined, ['device-a'], true), false);
});
test('서비스 워커가 끝나지 않아도 무한 대기하지 않는다', async () => {
  await assert.rejects(bounded(new Promise(() => {}), 5), /지연/);
});
test('빠른 연결과 실제 오류는 유지한다', async () => {
  assert.equal(await bounded(Promise.resolve('ready'), 100), 'ready');
  await assert.rejects(bounded(Promise.reject(new Error('offline')), 100), /offline/);
});
test('공급자 한도 문제를 고객에게 결제·키 설정으로 넘기지 않는다', () => {
  const failure = generationFailure(new Error('429 RESOURCE_EXHAUSTED quota API_KEY=private-test-value'));
  assert.equal(failure.status, 429);
  assert.doesNotMatch(failure.message, /API_KEY|private-test-value|결제|Gemini/);
  assert.match(failure.message, /저장된 초안/);
});
test('설정 장애는 입력 보존을 안내하고 원문을 공개하지 않는다', () => {
  const failure = generationFailure(new Error('api key not configured: private-test-value'));
  assert.equal(failure.status, 503);
  assert.doesNotMatch(failure.message, /private-test-value|api key/i);
  assert.match(failure.message, /다시 입력하지/);
});
test('알 수 없는 생성 실패에도 다시 진행할 경로를 안내한다', () => {
  const failure = generationFailure(new Error('unknown database failure with customer details'));
  assert.equal(failure.status, 500);
  assert.doesNotMatch(failure.message, /customer details/);
  assert.match(failure.message, /다시 시도/);
});
test('수정한 본문이 HTML 주입에도 반영되고 사용자 입력은 실행되지 않는다', () => {
  assert.equal(plainTextHtml('수정한 메뉴\n가격 5000원\n\n<script>alert(1)</script>'),
    '<p>수정한 메뉴<br>가격 5000원</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(plainTextHtml('A & B "추천"'), '<p>A &amp; B &quot;추천&quot;</p>');
});
test('로그인 연동을 기다리지 않고 인스타 캡션을 직접 사용할 수 있다', () => {
  assert.equal(readinessOf('instagram'), 'ready');
  assert.equal(readinessOf('instagram', ['META_APP_ID']), 'oauth');
  assert.equal(readinessOf('google_business'), 'ready');
  assert.equal(readinessOf('google_business', ['GOOGLE_CLIENT_ID']), 'oauth');
  assert.equal(readinessOf('kakao_alimtalk'), 'waiting');
});
