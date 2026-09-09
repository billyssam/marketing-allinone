// MV3 Service Worker
// - SaaS 대시보드 → 익스텐션 → 네이버 블로그 콘텐츠 스크립트를 잇는 다리
// - draft를 chrome.storage.local에 보관 (사장님이 write 페이지 열 때까지 대기)

const STORAGE_KEY = 'currentDraft';
// GoBlogWrite.naver는 로그인된 계정의 write 페이지로 자동 리다이렉트 (blogId 파라미터 불필요)
const NAVER_WRITE_URL = 'https://blog.naver.com/GoBlogWrite.naver';
// 플레이스 '소식' 작성 — 로그인된 사업장으로 자동 이동한다
const PLACE_WRITE_URL = 'https://new.smartplace.naver.com/';

/** 채널에 맞는 글쓰기 주소. 모르는 채널이면 블로그(기본 채널)로. */
function writeUrlFor(channel) {
  return channel === 'naver_place' ? PLACE_WRITE_URL : NAVER_WRITE_URL;
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
