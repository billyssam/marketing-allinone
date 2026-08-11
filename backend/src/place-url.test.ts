/**
 * 플레이스 주소 검증 회귀 테스트.
 * 실행: npx tsx --test src/place-url.test.ts
 *
 * 잘못된 주소가 저장되면 크롤이 매일 조용히 실패하고 사실 없는 글이 계속 나간다.
 * 사장님은 왜 메뉴·영업시간이 안 들어가는지 알 방법이 없다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPlaceUrl } from '../../shared/content-engine/place-facts.js';

test('정상 주소에서 place id를 뽑고 표준 형태로 정규화한다', () => {
  const cases = [
    'https://m.place.naver.com/place/1565864790/home',
    'https://map.naver.com/p/entry/place/1565864790',
    'https://map.naver.com/p/search/쿵더쿵/place/1565864790?c=15.00',
    'm.place.naver.com/restaurant/1565864790/home',
  ];
  for (const u of cases) {
    const r = checkPlaceUrl(u);
    assert.ok(r.ok, `${u} → 실패`);
    assert.equal(r.placeId, '1565864790', u);
    assert.equal(r.url, 'https://m.place.naver.com/place/1565864790/home', '표준 형태로 통일');
  }
});

test('빈 값은 오류가 아니다(플레이스는 선택 입력)', () => {
  for (const v of ['', '   ', null, undefined]) {
    const r = checkPlaceUrl(v);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'empty', `${JSON.stringify(v)} → ${JSON.stringify(r)}`);
  }
});

test('지도 앱 공유 단축 링크는 따로 구분한다(서버가 펼쳐야 함)', () => {
  // 가장 흔한 입력인데 그 안에는 place id가 없다 — "형식 오류"로 뭉뚱그리면
  // 사장님은 뭘 고쳐야 하는지 모른다.
  for (const u of ['https://naver.me/5xJqxKzR', 'http://naver.me/abcd']) {
    const r = checkPlaceUrl(u);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'shortlink', u);
  }
});

test('플레이스가 아닌 주소는 거른다', () => {
  for (const u of ['https://blog.naver.com/billysir', 'https://google.com', '그냥 텍스트', 'https://instagram.com/p/abc']) {
    const r = checkPlaceUrl(u);
    assert.equal(r.ok, false, `${u} → ${JSON.stringify(r)}`);
    assert.equal(r.reason, 'unknown', u);
  }
});
