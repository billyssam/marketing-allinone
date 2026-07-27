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
