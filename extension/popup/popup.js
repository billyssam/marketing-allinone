const $ = (id) => document.getElementById(id);

async function main() {
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onNaver = tab?.url?.startsWith('https://blog.naver.com');
  const onWritePage = onNaver && /PostWriteForm|\/write/.test(tab.url);

  const { ok, draft } = await sendToBackground({ type: 'GET_DRAFT' });

  if (draft && ok) {
    renderDraft(draft, onWritePage);
    setStatus(
      onWritePage
        ? '네이버 블로그 write 페이지 열림 — "지금 삽입" 클릭 or 페이지 우측 하단 FAB 사용'
        : onNaver
        ? '네이버 블로그 접속됨. write 페이지로 이동해주세요'
        : '초안 저장됨. 네이버 블로그 write 페이지를 여세요',
      'ok',
    );
  } else {
    renderPasteZone();
    setStatus(onNaver ? '초안이 없습니다. 대시보드에서 전달받거나 붙여넣으세요' : '초안이 없습니다', 'idle');
  }
}

function renderDraft(draft, onWritePage) {
  $('draft-view').hidden = false;
  $('paste-view').hidden = true;
  $('draft-title').textContent = draft.title ?? '(제목 없음)';
  $('draft-length').textContent = draft.bodyHtml?.length
    ? `본문 ${draft.bodyHtml.length}자`
    : '본문 없음';
  $('draft-tag-count').textContent = draft.tags?.length ?? 0;
  const savedAt = draft.savedAt ? new Date(draft.savedAt).toLocaleString('ko-KR') : '';
  $('draft-saved').textContent = savedAt ? `저장: ${savedAt}` : '';
  $('inject-now').hidden = !onWritePage;
}

function renderPasteZone() {
  $('draft-view').hidden = true;
  $('paste-view').hidden = false;
}

function setStatus(text, state) {
  const el = $('status');
  el.textContent = text;
  el.dataset.state = state;
}

async function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(resp ?? { ok: false, error: 'no response' });
      }
    });
  });
}

// 이벤트 바인딩
document.addEventListener('DOMContentLoaded', async () => {
  await main();

  $('open-write').addEventListener('click', async () => {
    await sendToBackground({ type: 'OPEN_WRITE_PAGE' });
    window.close();
  });

  $('inject-now').addEventListener('click', async () => {
    const res = await sendToBackground({ type: 'INJECT_NOW' });
    if (!res.ok) alert('삽입 실패: ' + res.error);
    else window.close();
  });

  $('clear-draft').addEventListener('click', async () => {
    if (!confirm('저장된 초안을 삭제할까요?')) return;
    await sendToBackground({ type: 'CLEAR_DRAFT' });
    location.reload();
  });

  $('save-pasted').addEventListener('click', async () => {
    const raw = $('paste-json').value.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      // {draft: {...}} 형태(test-draft.ts 출력)와 순수 draft 둘 다 지원
      const payload = parsed.draft ?? parsed;
      if (!payload.title || !payload.bodyHtml) {
        throw new Error('title 또는 bodyHtml 필드가 없습니다');
      }
      const res = await sendToBackground({ type: 'SAVE_DRAFT', payload });
      if (!res.ok) throw new Error(res.error ?? '알 수 없는 오류');
      location.reload();
    } catch (err) {
      $('paste-err').textContent = '❌ ' + err.message;
    }
  });

  $('open-dashboard').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'http://localhost:3000' });
  });
});
