// content.js — 네이버 블로그 SmartEditor ONE 주입 로직
// 2026-07-01 실측 확인:
//  - 에디터는 iframe#mainFrame 안에서 렌더 (same-origin)
//  - CSS 네임스페이스: se-* (SmartEditor ONE)
//  - 이미지 첨부 버튼: .se-image-toolbar-button
//  - top(부모)에서 실행, iframe 안으로 진입해 셀렉터 검색

const FAB_ID = 'blog-oneclick-fab';
// 부모 페이지: /billysir?Redirect=Write / 자식 iframe: PostWriteForm.naver
const IS_WRITE_URL = /Redirect=Write|PostWriteForm\.naver/;

console.log('[블로그 원클릭] content script 로드:', location.href);

if (IS_WRITE_URL.test(location.href)) {
  ensureFabOnLoad();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'INJECT_DRAFT') {
    injectDraft(message.payload)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => {
        console.error('[블로그 원클릭] 주입 실패:', err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }
});

function ensureFabOnLoad() {
  // 부모 프레임에서만 FAB 표시 (iframe 안에는 안 뜨게)
  if (window.top !== window) return;
  chrome.runtime.sendMessage({ type: 'GET_DRAFT' }, (response) => {
    if (chrome.runtime.lastError || !response?.ok || !response.draft) return;
    renderFab(response.draft);
  });
}

function renderFab(draft) {
  if (document.getElementById(FAB_ID)) return;

  const bodyPlainText = htmlToText(draft.bodyHtml || '');
  const tagsText = (draft.tags || []).map((t) => `#${t}`).join(' ');

  const steps = [
    {
      key: 'title',
      label: '제목',
      value: draft.title || '',
      hint: '제목 입력창 클릭 → Ctrl+V',
    },
    {
      key: 'body',
      label: '본문',
      value: bodyPlainText,
      html: draft.bodyHtml || '',
      hint: '본문 첫 문단 클릭 → Ctrl+V',
    },
    {
      key: 'tags',
      label: '태그',
      value: tagsText,
      hint: '태그 입력창 클릭 → Ctrl+V',
    },
  ];

  const fab = document.createElement('div');
  fab.id = FAB_ID;
  fab.innerHTML = `
    <div class="blog-oneclick-fab__inner">
      <div class="blog-oneclick-fab__title">📝 <span data-slot="step-label">단계 1/3 · 제목</span></div>
      <div class="blog-oneclick-fab__preview" data-slot="preview"></div>
      <div class="blog-oneclick-fab__hint" data-slot="hint"></div>
      <div class="blog-oneclick-fab__row">
        <button class="blog-oneclick-fab__btn" data-action="copy">📋 복사</button>
        <button class="blog-oneclick-fab__btn blog-oneclick-fab__btn--ghost" data-action="next">다음 →</button>
      </div>
      <div class="blog-oneclick-fab__row">
        <button class="blog-oneclick-fab__btn blog-oneclick-fab__btn--ghost" data-action="prev">← 이전</button>
        <button class="blog-oneclick-fab__btn blog-oneclick-fab__btn--ghost" data-action="dismiss">닫기</button>
      </div>
    </div>
  `;
  document.body.appendChild(fab);

  let idx = 0;
  const stepLabel = fab.querySelector('[data-slot="step-label"]');
  const preview = fab.querySelector('[data-slot="preview"]');
  const hint = fab.querySelector('[data-slot="hint"]');

  async function render() {
    const s = steps[idx];
    stepLabel.textContent = `단계 ${idx + 1}/${steps.length} · ${s.label}`;
    preview.textContent = s.value.length > 80 ? s.value.slice(0, 80) + '…' : s.value;
    hint.innerHTML = `👉 ${s.hint}`;
    // 자동 복사 (UX 개선)
    await copyStep(s);
    hint.innerHTML = `✅ 클립보드에 <b>${s.label}</b> 준비됨. ${s.hint}`;
  }

  async function copyStep(s) {
    try {
      if (s.html && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([s.html], { type: 'text/html' }),
            'text/plain': new Blob([s.value], { type: 'text/plain' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(s.value);
      }
      console.log(`[FAB] ${s.label} 클립보드 복사 완료`);
    } catch (err) {
      console.warn(`[FAB] 클립보드 실패:`, err.message);
      hint.innerHTML = `❌ 클립보드 실패. 수동 복사 필요.<br>내용: <code>${escapeHtml(s.value.slice(0, 60))}</code>`;
    }
  }

  fab.querySelector('[data-action="copy"]').addEventListener('click', () => copyStep(steps[idx]));
  fab.querySelector('[data-action="next"]').addEventListener('click', () => {
    if (idx < steps.length - 1) {
      idx++;
      render();
    } else {
      stepLabel.textContent = '🎉 완료';
      preview.textContent = '이제 상단 "발행" 버튼을 눌러주세요.';
      hint.innerHTML = '';
    }
  });
  fab.querySelector('[data-action="prev"]').addEventListener('click', () => {
    if (idx > 0) {
      idx--;
      render();
    }
  });
  fab.querySelector('[data-action="dismiss"]').addEventListener('click', () => fab.remove());

  render();
}

// ============================================================
// 실제 주입 로직
// ============================================================

async function injectDraft(payload) {
  console.group('[블로그 원클릭] injectDraft');
  console.log('제목:', payload.title);
  console.log('본문 길이:', payload.bodyHtml?.length, '자');
  console.log('태그:', payload.tags);

  const editorDoc = await waitForEditorDoc();
  console.log('에디터 doc 확보:', editorDoc.location.href.slice(0, 80));

  const steps = [];
  // 1) 제목
  try {
    await injectTitle(editorDoc, payload.title);
    steps.push({ step: '제목', ok: true });
  } catch (e) {
    steps.push({ step: '제목', ok: false, error: e.message });
  }

  // 2) 본문
  try {
    await injectBody(editorDoc, payload.bodyHtml);
    steps.push({ step: '본문', ok: true });
  } catch (e) {
    steps.push({ step: '본문', ok: false, error: e.message });
  }

  // 3) 태그 (발행 popup 열릴 때 처리 — Phase 2 후반)
  // TODO: 발행 popup 감지 후 태그 자동 입력. 지금은 스킵.

  console.table(steps);
  console.groupEnd();

  const failed = steps.filter((s) => !s.ok);
  if (failed.length === steps.length) throw new Error('모든 단계 실패');
  return { steps, warning: failed.length ? `${failed.length}개 단계 실패` : null };
}

async function waitForEditorDoc(maxMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const iframe = document.querySelector('iframe#mainFrame');
    const doc = iframe?.contentDocument;
    // se-body가 렌더된 순간을 편집 준비 완료로 판단
    if (doc?.querySelector('.se-body, [class*="se-body"], .se-container')) {
      return doc;
    }
    await sleep(300);
  }
  throw new Error('SmartEditor iframe(mainFrame) 감지 실패');
}

async function injectTitle(doc, title) {
  if (!title) return;

  const candidates = [
    // 제목 section 안 첫 번째 문단
    doc.querySelector('.se-section-documentTitle .se-text-paragraph'),
    doc.querySelector('.se-section-documentTitle [contenteditable="true"]'),
    doc.querySelector('.se-title-text'),
    doc.querySelector('[class*="documentTitle"] [contenteditable]'),
    doc.querySelector('[placeholder*="제목"]'),
    Array.from(doc.querySelectorAll('[contenteditable="true"]'))[0],
  ].filter(Boolean);

  console.log('[제목] 후보 개수:', candidates.length);
  if (!candidates.length) throw new Error('제목 요소 미발견');

  const el = candidates[0];
  console.log('[제목] 선택:', el.tagName, el.className);
  await typeInto(doc, el, title, false);
}

async function injectBody(doc, bodyHtml) {
  if (!bodyHtml) return;

  const candidates = [
    // 본문 section 안 첫 번째 문단 (제목 section 제외)
    ...Array.from(doc.querySelectorAll('.se-component .se-text-paragraph')).filter(
      (el) => !el.closest('.se-section-documentTitle'),
    ),
    doc.querySelector('.se-body .se-text-paragraph:not(.se-section-documentTitle *)'),
    Array.from(doc.querySelectorAll('[contenteditable="true"]'))[1],
  ].filter(Boolean);

  console.log('[본문] 후보 개수:', candidates.length);
  if (!candidates.length) throw new Error('본문 편집 영역 미발견');

  const el = candidates[0];
  console.log('[본문] 선택:', el.tagName, el.className);
  await typeInto(doc, el, bodyHtml, true);
}

/**
 * React 기반 SmartEditor ONE에 값 삽입.
 * 여러 방식 순차 시도:
 *   1) 시스템 클립보드 + execCommand('paste')  ← 마지막 카드, React 우회 가능성 有
 *   2) paste event with DataTransfer
 *   3) beforeinput + input (fallback)
 *   4) 직접 DOM 조작 (마지막 수단, React가 덮어씀)
 */
function containsStart(a, b, len = 8) {
  if (!a || !b) return false;
  const chunk = b.slice(0, Math.min(len, b.length));
  return a.includes(chunk);
}

async function typeInto(doc, el, value, asHtml) {
  // 사용자가 클릭한 것처럼 focus 트리거
  const rect = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, clientX: rect.left + 10, clientY: rect.top + 10,
  }));
  el.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true, clientX: rect.left + 10, clientY: rect.top + 10,
  }));
  el.dispatchEvent(new MouseEvent('click', {
    bubbles: true, clientX: rect.left + 10, clientY: rect.top + 10,
  }));
  el.focus();
  await sleep(150);

  // 요소 전체 선택 (기존 placeholder 대체)
  const range = doc.createRange();
  range.selectNodeContents(el);
  const sel = doc.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  await sleep(80);

  const plainText = asHtml ? htmlToText(value) : value;

  // === Method 1: 시스템 클립보드 + execCommand('paste') (React 우회 후보) ===
  try {
    if (asHtml && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([value], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(plainText);
    }
    console.log('[typeInto] 시스템 클립보드 쓰기 완료');

    el.focus();
    const r2 = doc.createRange();
    r2.selectNodeContents(el);
    doc.getSelection().removeAllRanges();
    doc.getSelection().addRange(r2);
    await sleep(80);

    const pasteOk = doc.execCommand('paste');
    console.log(`[typeInto] execCommand('paste') => ${pasteOk}`);
    await sleep(300);
    const inserted = (el.textContent || '').trim();
    console.log(`[typeInto] 클립보드 paste 후: "${inserted.slice(0, 40)}"`);
    if (containsStart(inserted, plainText)) {
      console.log(`[typeInto] ✅ 클립보드 paste 성공`);
      return;
    }
  } catch (err) {
    console.warn('[typeInto] 클립보드 method 실패:', err.message);
  }

  // === Method 2: ClipboardEvent + DataTransfer ===
  try {
    const dt = new DataTransfer();
    dt.setData('text/plain', plainText);
    if (asHtml) dt.setData('text/html', value);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: dt, bubbles: true, cancelable: true,
    });
    el.dispatchEvent(pasteEvent);
    await sleep(250);
    const inserted = (el.textContent || '').trim();
    console.log(`[typeInto] ClipboardEvent 후: "${inserted.slice(0, 40)}"`);
    if (containsStart(inserted, plainText)) {
      console.log(`[typeInto] ✅ ClipboardEvent 성공`);
      return;
    }
  } catch (err) {
    console.warn('[typeInto] ClipboardEvent 실패:', err.message);
  }

  // === Method 3: beforeinput ===
  try {
    const dt2 = new DataTransfer();
    dt2.setData('text/plain', plainText);
    if (asHtml) dt2.setData('text/html', value);
    el.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true, cancelable: true,
      inputType: 'insertFromPaste', data: plainText, dataTransfer: dt2,
    }));
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true, cancelable: true,
      inputType: 'insertFromPaste', data: plainText,
    }));
    await sleep(200);
    const inserted = (el.textContent || '').trim();
    console.log(`[typeInto] beforeinput 후: "${inserted.slice(0, 40)}"`);
    if (containsStart(inserted, plainText)) {
      console.log(`[typeInto] ✅ beforeinput 성공`);
      return;
    }
  } catch (err) {
    console.warn('[typeInto] beforeinput 실패:', err.message);
  }

  // === Method 4: 직접 DOM (React 덮어쓸 수 있음) ===
  console.log('[typeInto] ⚠️ 모든 표준 방식 실패, 직접 DOM 조작');
  if (asHtml) el.innerHTML = value;
  else el.textContent = value;
  el.dispatchEvent(new InputEvent('input', {
    bubbles: true, cancelable: true, data: value, inputType: 'insertText',
  }));
  throw new Error('SmartEditor React 보호로 자동 삽입 불가 — 대체 UX 필요');
}

function htmlToText(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
