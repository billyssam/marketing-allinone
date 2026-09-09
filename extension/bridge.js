/**
 * 웹앱 ↔ 확장 다리 (content script).
 *
 * 왜 postMessage 인가: `chrome.runtime.sendMessage(EXT_ID, …)` 방식은 **확장 ID를 알아야** 한다.
 * 그런데 개발 중 언패키지 확장의 ID는 **설치 경로에 따라 기기마다 달라져서**,
 * 웹앱에 미리 박아둘 수가 없다(스토어 배포 후에야 고정된다).
 * content script 를 우리 도메인에 꽂아 두면 웹앱은 그냥 `window.postMessage` 만 하면 되고,
 * 확장이 깔려 있을 때만 답이 온다 — ID도, 환경변수도 필요 없다.
 *
 * 규약(웹앱 → 확장):
 *   { source: 'maio-web', type: 'PING' | 'DRAFT_READY', payload?, reqId }
 * 답(확장 → 웹앱):
 *   { source: 'maio-ext', reqId, ok, version?, error? }
 */
(() => {
  const WEB = 'maio-web';
  const EXT = 'maio-ext';

  window.addEventListener('message', (ev) => {
    // 같은 창에서 온 것만 받는다 — iframe·다른 출처가 끼어들지 못하게
    if (ev.source !== window) return;
    const msg = ev.data;
    if (!msg || msg.source !== WEB || !msg.reqId) return;

    const reply = (body) => window.postMessage({ source: EXT, reqId: msg.reqId, ...body }, window.location.origin);

    if (msg.type === 'PING') {
      reply({ ok: true, version: chrome.runtime.getManifest().version });
      return;
    }

    if (msg.type === 'DRAFT_READY') {
      // 초안을 백그라운드에 맡기고, 네이버 글쓰기 탭을 연다.
      // 탭을 여는 건 확장만 할 수 있다(웹앱이 열면 팝업 차단에 걸린다).
      chrome.runtime.sendMessage({ type: 'SAVE_DRAFT', payload: msg.payload }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          reply({ ok: false, error: chrome.runtime.lastError?.message ?? res?.error ?? '초안 저장 실패' });
          return;
        }
        chrome.runtime.sendMessage({ type: 'OPEN_WRITE_PAGE' }, (r2) => {
          if (chrome.runtime.lastError || !r2?.ok) {
            // 초안은 저장됐으니 사장님이 직접 글쓰기로 가도 채워진다 — 그걸 알려준다
            reply({ ok: true, note: '초안은 준비됐어요. 네이버 글쓰기 페이지를 직접 열어주세요.' });
            return;
          }
          reply({ ok: true });
        });
      });
    }
  });

  // 웹앱이 먼저 로드된 뒤에 확장이 붙는 경우를 위해, 붙자마자 한 번 알린다
  window.postMessage({ source: EXT, reqId: 'hello', ok: true, version: chrome.runtime.getManifest().version }, window.location.origin);
})();
