/**
 * 마케팅올인원 서비스 워커 — "앱처럼 설치되고, 끊겨도 안내되게".
 *
 * 설계 원칙(중요): 캐시 때문에 사장님이 **옛 화면을 보는 일이 절대 없어야 한다.**
 *  - 문서(네비게이션): 항상 네트워크 우선. 오프라인일 때만 안내 페이지.
 *  - /api/*: 캐시 금지(개인 데이터 + 신선도가 생명).
 *  - /_next/static, 폰트·아이콘: 파일명에 해시가 있어 불변 → 캐시 우선(빠른 재방문).
 * 이 fetch 핸들러가 있어야 Android Chrome이 "앱 설치"를 제안한다(installability 요건).
 */
const CACHE = 'maio-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const IMMUTABLE = /^\/_next\/static\//;
const ASSET_EXT = /\.(?:woff2?|png|jpg|jpeg|svg|ico|webp)$/i;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // 외부 도메인은 개입 안 함
  if (url.pathname.startsWith('/api/')) return; // 개인 데이터·신선도 → 캐시 금지

  // 불변 자산: 캐시 우선(있으면 네트워크 안 탐)
  if (IMMUTABLE.test(url.pathname) || ASSET_EXT.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(req, clone));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // 페이지: 네트워크 우선 — 온라인이면 언제나 최신 화면
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r ?? new Response('오프라인입니다.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } })),
      ),
    );
  }
});

/**
 * 웹 푸시 — 카톡봇이 하려던 "매일 아침 폰으로 찌르기"를 심사·비용 없이 대신한다.
 *
 * 왜 이걸로 시작하나: 알림톡은 사업자 등록 + 템플릿 심사 2주 + 건당 8~15원이고,
 * 챗봇·친구톡은 카카오 비즈니스 채널 개설이 선행이라 **지금 동작 확인이 불가능**하다.
 * 웹 푸시는 VAPID 자체 발급이라 무료·심사 없음. 안드로이드 크롬에서 바로 되고,
 * iOS는 홈 화면에 추가한 경우(16.4+) 된다 — 그래서 설치 유도가 먼저다.
 */
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || '마케팅올인원';
  const options = {
    body: payload.body || '오늘 글이 준비됐어요.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // 같은 태그면 알림이 쌓이지 않고 갱신된다 — 하루 여러 번 울려도 목록이 지저분해지지 않게
    tag: payload.tag || 'daily',
    renotify: true,
    data: { url: payload.url || '/dashboard' },
    // 사장님은 주방·매장에서 폰을 본다. 진동으로 한 번 알리고 끝.
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 이미 열려 있는 탭이 있으면 그걸 쓴다 — 탭이 계속 늘어나면 사장님이 헷갈린다
      for (const c of list) {
        if (c.url.includes(url) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
