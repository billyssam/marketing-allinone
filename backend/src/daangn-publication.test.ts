import test from 'node:test';
import { strict as assert } from 'node:assert';
import { danggeunAdapter } from './channels/delivery-assisted.js';

test('당근은 제목·본문을 하나로 전달하고 한도·복귀 안내를 제공하되 실제 게시 성공으로 기록하지 않는다', async () => {
  const result = await danggeunAdapter.publish({ channelId: 'danggeun', storeId: 'qa', status: 'pending' }, {
    title: '검증용 제목', bodyPlain: '가상 검증 본문', tags: ['넣지않음'],
  });
  assert.equal(result.mode, 'assisted');
  assert.equal(result.externalUrl, undefined);
  assert.equal(result.handoff?.deeplink, 'https://business.daangn.com/');
  assert.deepEqual(result.handoff?.clipboard, [{ label: '본문', text: '검증용 제목\n\n가상 검증 본문' }]);
  assert.ok(result.handoff?.steps.some(s => s.includes('하루 최대 5개')));
  assert.ok(result.handoff?.steps.some(s => s.includes('이 탭으로 돌아와')));
});

test('당근 HTML만 있는 초안도 본문이 유실되지 않는다', async () => {
  const result = await danggeunAdapter.publish({ channelId: 'danggeun', storeId: 'qa', status: 'pending' }, {
    bodyHtml: '<p>첫 문단</p><p>둘째 문단</p>',
  });
  assert.deepEqual(result.handoff?.clipboard, [{ label: '본문', text: '첫 문단\n\n둘째 문단' }]);
});
