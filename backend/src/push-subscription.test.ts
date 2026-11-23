import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { parsePushSubscription, selectPushSubscriptions, validVapidKeyPair } from '../../shared/push-subscription';

const pair = createECDH('prime256v1'); pair.generateKeys();
const keys = { p256dh: pair.getPublicKey().toString('base64url'), auth: Buffer.alloc(16, 2).toString('base64url') };

test('Chrome·Firefox·Safari·Edge 운영 구독과 올바른 암호키를 허용한다', () => {
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/device', 'https://updates.push.services.mozilla.com/wpush/v2/device',
    'https://web.push.apple.com/device', 'https://wns2-by3p.notify.windows.com/?token=device']) {
    assert.equal(parsePushSubscription({ endpoint, keys })?.endpoint, endpoint);
  }
});

test('내부망·유사 도메인·비TLS·URL 자격증명·비표준 포트는 거절한다', () => {
  for (const endpoint of ['http://fcm.googleapis.com/fcm/send/device', 'https://127.0.0.1/device', 'https://[::1]/device',
    'http://169.254.169.254/latest/meta-data', 'https://fcm.googleapis.com.evil.test/device',
    'https://evilnotify.windows.com/device', 'https://push.apple.com.attacker.test/device',
    'https://user:pass@fcm.googleapis.com/device', 'https://fcm.googleapis.com:8443/device',
    'https://fcm.googleapis.com/device#fragment', 'file:///etc/passwd']) {
    assert.equal(parsePushSubscription({ endpoint, keys }), null, endpoint);
  }
});

test('키 길이뿐 아니라 P-256 점과 base64url 인코딩을 검증한다', () => {
  const endpoint = 'https://fcm.googleapis.com/fcm/send/device';
  const invalidPoint = Buffer.alloc(65); invalidPoint[0] = 4;
  for (const bad of [{ ...keys, p256dh: invalidPoint.toString('base64url') }, { ...keys, auth: 'bad' },
    { ...keys, auth: keys.auth + '!'}, { ...keys, p256dh: keys.p256dh.slice(1) }]) {
    assert.equal(parsePushSubscription({ endpoint, keys: bad }), null);
  }
  assert.equal(parsePushSubscription({ endpoint, keys: { p256dh: keys.p256dh + '=', auth: keys.auth + '==' } })?.keys.auth, keys.auth);
});

test('비정상 metadata의 검사량·기기 수를 제한하고 중복/제외 기기를 제거한다', () => {
  assert.deepEqual(selectPushSubscriptions({ endpoint: 'invalid' }), { subscriptions: [], rejected: 1 });
  assert.deepEqual(selectPushSubscriptions(undefined), { subscriptions: [], rejected: 0 });
  const endpoint = 'https://fcm.googleapis.com/fcm/send/device';
  assert.equal(selectPushSubscriptions([{ endpoint, keys }, { endpoint, keys }]).subscriptions.length, 1);
  assert.equal(selectPushSubscriptions([{ endpoint, keys }], new Set([endpoint])).subscriptions.length, 0);
  assert.equal(selectPushSubscriptions(Array(1000).fill(null)).rejected, 1000);
});

test('형식은 정상이지만 서로 다른 VAPID 키 쌍과 잘못된 개인키를 거절한다', () => {
  const other = createECDH('prime256v1'); other.generateKeys();
  const pub = pair.getPublicKey().toString('base64url'), priv = pair.getPrivateKey().toString('base64url');
  assert.equal(validVapidKeyPair(pub, priv), true);
  assert.equal(validVapidKeyPair(pub, other.getPrivateKey().toString('base64url')), false);
  assert.equal(validVapidKeyPair(pub, Buffer.alloc(32).toString('base64url')), false);
  assert.equal(validVapidKeyPair(undefined, priv), false);
});
