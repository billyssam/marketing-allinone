/**
 * 범용 글 주입기 — 플레이스·밴드·당근·카카오채널·구글 비즈니스.
 *
 * 왜 하나로 묶었나: 이 채널들은 **공식 글쓰기 API가 없거나(당근·밴드) 승인이 오래 걸린다**.
 * 네이버 블로그도 2020년 5월에 글쓰기 API가 종료돼 브라우저 자동화가 유일한 길이다.
 * 화면 구조만 다를 뿐 하는 일은 같다 — **가장 큰 입력칸에 글을 넣는다**.
 * 채널마다 파일을 따로 두면 한 곳만 고쳐지고 나머지가 낡는다(이 프로젝트의 반복 결함).
 *
 * ⚠️ 이 화면들의 셀렉터는 **검증하지 못했다**(각 서비스 로그인이 필요해 자동 검증 불가).
 * 그래서 못 찾았을 때 **조용히 지나가지 않는다** — 화면에 알리고 클립보드로 떨어뜨린다.
 * 버튼을 눌렀는데 아무 일도 안 일어나는 게 최악이다.
 *
 * 블로그(content.js)만 따로인 이유: 제목+본문 두 칸이고 SmartEditor iframe 안에 있어
 * 구조가 근본적으로 다르다.
 */
(() => {
  const KEY = 'currentDraft';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** 이 탭이 어느 채널인가 — 초안의 채널과 맞을 때만 넣는다(엉뚱한 탭에 붙지 않게) */
  function channelOfThisPage() {
    const h = location.hostname;
    if (h.includes('smartplace.naver.com')) return 'naver_place';
    if (h.includes('band.us')) return 'naver_band';
    if (h.includes('daangn.com')) return 'danggeun';
    if (h.includes('center-pf.kakao.com')) return 'kakao_channel';
    if (h.includes('business.google.com')) return 'google_gbp';
    return null;
  }

  const LABEL = {
    naver_place: '플레이스 소식',
    naver_band: '밴드',
    danggeun: '당근 동네홍보',
    kakao_channel: '카카오 채널',
    google_gbp: '구글 비즈니스',
  };

  function panel(html, tone) {
    let el = document.getElementById('maio-panel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'maio-panel';
      el.style.cssText = [
        'position:fixed', 'right:20px', 'bottom:20px', 'z-index:2147483647',
        'max-width:330px', 'padding:14px 16px', 'border-radius:12px',
        'font:14px/1.6 -apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif',
        'box-shadow:0 8px 28px rgba(0,0,0,.24)', 'background:#111', 'color:#fff',
      ].join(';');
      document.documentElement.appendChild(el);
    }
    el.style.borderLeft = `4px solid ${tone === 'err' ? '#ff5a5a' : tone === 'ok' ? '#16d66a' : '#ffb534'}`;
    el.innerHTML = html;
    return el;
  }

  /** 글을 넣을 칸 — 보이는 것 중 가장 큰 입력 영역. 검색창 같은 한 줄짜리는 걸러진다. */
  function findComposer() {
    const big = (el) => {
      const r = el.getBoundingClientRect();
      // 한 줄 입력(검색창)과 본문 칸을 가르는 선 — 높이 40px
      return r.width > 150 && r.height > 40;
    };
    const cands = [
      ...document.querySelectorAll('textarea'),
      ...document.querySelectorAll('[contenteditable="true"]'),
      ...document.querySelectorAll('[role="textbox"]'),
    ].filter(big);
    return cands.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    })[0] ?? null;
  }

  /** 값을 넣고 **되읽어 확인한다** — 넣은 척하고 넘어가면 사장님이 빈 칸을 발행한다 */
  async function fill(el, text) {
    el.focus();
    await sleep(120);
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      // React 제어 컴포넌트 우회 — 네이티브 setter 로 넣고 input 이벤트를 쏜다
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      setter ? setter.call(el, text) : (el.value = text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value.trim().length > 0;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    return el.innerText.trim().length > 0;
  }

  async function run() {
    const here = channelOfThisPage();
    if (!here) return;
    const { [KEY]: draft } = await chrome.storage.local.get(KEY);
    if (!draft) return;
    // 초안의 채널과 이 탭이 다르면 건드리지 않는다
    if (draft.channel && draft.channel !== here) return;

    const text = (draft.bodyPlain || draft.bodyHtml || '').replace(/<[^>]+>/g, '').trim();
    if (!text) return;

    const name = LABEL[here] ?? '이 화면';
    panel(`${name}에 <b>글을 넣고 있어요…</b>`, 'wait');

    // SPA 라 첫 진입엔 입력칸이 아직 없다 — 그려질 때까지 기다린다
    let el = null;
    for (let i = 0; i < 24 && !el; i++) {
      el = findComposer();
      if (!el) await sleep(500);
    }

    if (!el || !(await fill(el, text))) {
      // 🔴 조용히 실패하지 않는다 — 못 넣었다고 말하고 클립보드로 떨어뜨린다
      try { await navigator.clipboard.writeText(text); } catch { /* 권한 없으면 안내만 */ }
      panel(
        `${name} 입력칸을 못 찾았어요.<br><b>글은 복사해 뒀습니다</b> — 작성칸에 붙여넣어 주세요.`
        + '<br><span style="opacity:.65;font-size:12px">화면 구조가 바뀐 것 같아요. 알려주시면 고칩니다.</span>',
        'err',
      );
      return;
    }

    panel(`✅ 글을 넣었어요. <b>확인하고 등록</b>만 누르시면 됩니다.`, 'ok');
    await chrome.storage.local.remove(KEY);
  }

  // SPA 는 URL 이 바뀌어도 스크립트가 다시 안 돈다 → 진입 시 + 잠시 뒤 한 번 더
  run();
  setTimeout(run, 2500);
})();
