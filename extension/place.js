/**
 * 네이버 스마트플레이스 '소식' 자동 채우기.
 *
 * 블로그(content.js)와 다른 점:
 *  - 제목이 없다. **본문 한 덩어리**만 넣는다(플레이스 소식은 단일 텍스트).
 *  - SmartEditor iframe 이 아니라 페이지 본문에 에디터가 있다.
 *
 * ⚠️ 이 화면의 셀렉터는 **검증하지 못했다**(네이버 로그인이 필요해 자동 검증 불가).
 * 그래서 못 찾았을 때 조용히 지나가지 않는다 — 화면에 **크게 알리고 클립보드로 떨어뜨린다.**
 * 조용히 실패하면 사장님은 버튼을 눌렀는데 아무 일도 안 일어난 걸로 본다.
 */
(() => {
  const KEY = 'currentDraft';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function panel(html, tone) {
    let el = document.getElementById('maio-place-panel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'maio-place-panel';
      el.style.cssText = [
        'position:fixed', 'right:20px', 'bottom:20px', 'z-index:2147483647',
        'max-width:320px', 'padding:14px 16px', 'border-radius:12px',
        'font:14px/1.6 -apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif',
        'box-shadow:0 8px 28px rgba(0,0,0,.22)', 'background:#111', 'color:#fff',
      ].join(';');
      document.documentElement.appendChild(el);
    }
    el.style.borderLeft = `4px solid ${tone === 'err' ? '#ff5a5a' : tone === 'ok' ? '#16d66a' : '#ffb534'}`;
    el.innerHTML = html;
    return el;
  }

  /** 소식 작성 입력칸 찾기 — 여러 후보를 순서대로, 보이는 것만 */
  function findComposer() {
    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 120 && r.height > 40;
    };
    const candidates = [
      ...document.querySelectorAll('textarea'),
      ...document.querySelectorAll('[contenteditable="true"]'),
      ...document.querySelectorAll('[role="textbox"]'),
    ].filter(visible);
    // 가장 큰 입력칸 = 본문일 확률이 높다
    return candidates.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    })[0] ?? null;
  }

  async function fill(el, text) {
    el.focus();
    await sleep(120);
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      // React 제어 컴포넌트 우회 — 네이티브 setter 로 값을 넣고 input 이벤트를 쏜다
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter ? setter.call(el, text) : (el.value = text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value === text;
    }
    // contenteditable
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand('insertText', false, text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    return ok && el.innerText.trim().length > 0;
  }

  async function run() {
    const { [KEY]: draft } = await chrome.storage.local.get(KEY);
    if (!draft || draft.channel !== 'naver_place') return;

    const text = (draft.bodyPlain || draft.bodyHtml || '').replace(/<[^>]+>/g, '').trim();
    if (!text) return;

    panel('플레이스 소식에 <b>글을 넣고 있어요…</b>', 'wait');

    // 화면이 그려질 때까지 기다린다(SPA 라 첫 진입에 입력칸이 아직 없다)
    let el = null;
    for (let i = 0; i < 24 && !el; i++) {
      el = findComposer();
      if (!el) await sleep(500);
    }

    if (!el) {
      // 🔴 조용히 실패하지 않는다 — 못 찾았다고 말하고 클립보드로 떨어뜨린다
      try { await navigator.clipboard.writeText(text); } catch { /* 권한 없으면 아래 안내만 */ }
      panel(
        '입력칸을 못 찾았어요.<br><b>글은 복사해 뒀습니다</b> — 소식 작성칸에 붙여넣어 주세요.'
        + '<br><span style="opacity:.7;font-size:12px">(이 화면 구조가 바뀐 것 같아요. 알려주시면 고칩니다)</span>',
        'err',
      );
      return;
    }

    const ok = await fill(el, text);
    if (ok) {
      panel('✅ 글을 넣었어요. <b>내용 확인하고 등록</b>만 누르시면 됩니다.', 'ok');
      await chrome.storage.local.remove(KEY);
    } else {
      try { await navigator.clipboard.writeText(text); } catch { /* noop */ }
      panel('입력이 안 먹었어요. <b>글은 복사해 뒀으니</b> 붙여넣어 주세요.', 'err');
    }
  }

  // SPA 라 URL 이 바뀌어도 스크립트가 다시 안 돈다 → 진입 시 한 번 + 잠시 뒤 한 번
  run();
  setTimeout(run, 2500);
})();
