// MV3 Service Worker
// - SaaS 대시보드 → 익스텐션 → 네이버 블로그 콘텐츠 스크립트를 잇는 다리
// - draft를 chrome.storage.local에 보관 (사장님이 write 페이지 열 때까지 대기)

const STORAGE_KEY = 'currentDraft';
// GoBlogWrite.naver는 로그인된 계정의 write 페이지로 자동 리다이렉트 (blogId 파라미터 불필요)
const NAVER_WRITE_URL = 'https://blog.naver.com/GoBlogWrite.naver';

/**
 * 채널별 글쓰기 주소.
 * 전부 **로그인된 계정의 작성 화면으로 자동 이동**하는 주소다 —
 * 사장님 아이디를 우리가 알 필요가 없다(그래서 비밀번호도 안 받는다).
 */
const WRITE_URL = {
  blog: NAVER_WRITE_URL,
  naver_place: 'https://new.smartplace.naver.com/',
  naver_band: 'https://band.us/',
  danggeun: 'https://www.daangn.com/',
  kakao_channel: 'https://center-pf.kakao.com/',
  google_gbp: 'https://business.google.com/posts',
};

/** 모르는 채널이면 블로그(기본 채널)로 — 빈 탭을 여는 것보다 낫다 */
function writeUrlFor(channel) {
  return WRITE_URL[channel] ?? NAVER_WRITE_URL;
}

chrome.runtime.onInstalled.addListener(({ reason }) => {
  console.log('[블로그 원클릭] 설치/업데이트:', reason);
});

// 대시보드(웹앱) → 익스텐션
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type === 'DRAFT_READY') {
    saveDraft(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message?.type === 'PING') {
    sendResponse({ ok: true, version: chrome.runtime.getManifest().version });
    return;
  }
});

// 팝업 → 익스텐션
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'SAVE_DRAFT') {
    saveDraft(message.payload)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (message?.type === 'GET_DRAFT') {
    getDraft().then((draft) => sendResponse({ ok: true, draft }));
    return true;
  }
  if (message?.type === 'CLEAR_DRAFT') {
    chrome.storage.local.remove(STORAGE_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'OPEN_WRITE_PAGE') {
    // 채널에 따라 여는 곳이 다르다 — 블로그 글쓰기 vs 플레이스 소식
    chrome.tabs
      .create({ url: writeUrlFor(message.channel) })
      .then((tab) => sendResponse({ ok: true, tabId: tab.id }));
    return true;
  }
  if (message?.type === 'INJECT_NOW') {
    injectToActiveTab()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});

async function saveDraft(payload) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      ...payload,
      savedAt: new Date().toISOString(),
    },
  });
  console.log('[블로그 원클릭] draft 저장됨:', payload?.title);
}

async function getDraft() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? null;
}

async function injectToActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith('https://blog.naver.com')) {
    throw new Error('네이버 블로그 write 페이지가 아닙니다');
  }
  const draft = await getDraft();
  if (!draft) throw new Error('저장된 초안이 없습니다');
  return chrome.tabs.sendMessage(tab.id, { type: 'INJECT_DRAFT', payload: draft });
}
