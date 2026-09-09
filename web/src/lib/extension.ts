/**
 * 브라우저 확장(네이버 블로그 원클릭)과의 다리 — 웹앱 쪽.
 *
 * 왜 있나: 지금까지 이 제품의 마지막 관문은 **사장님이 손으로 붙여넣는 것**이었다.
 * 채널 27개를 정의해 놓고 실제로 연결된 건 0개, 외부 발행 URL도 0건이었다.
 * 확장을 깔면 네이버 블로그만큼은 **버튼 하나로** 에디터에 채워진다
 * (제목·본문을 SmartEditor iframe에 직접 주입 — 클립보드를 거치지 않는다).
 *
 * 왜 `chrome.runtime` 이 아니라 `postMessage` 인가:
 * runtime 방식은 **확장 ID를 알아야** 하는데, 언패키지 확장의 ID는 설치 경로에 따라
 * 기기마다 달라져서 웹앱에 박아둘 수가 없다(스토어 배포 후에야 고정). 확장이 우리 도메인에
 * 꽂아 둔 content script 와 창 메시지로 주고받으면 ID도 환경변수도 필요 없다.
 *
 * ⚠️ 확장은 **선택**이다. 안 깔면 지금처럼 붙여넣기 3단계로 떨어진다 —
 * 설치를 강요하면 첫날 이탈한다. 그래서 감지 실패는 조용히 false 다.
 */

const WEB = 'maio-web';
const EXT = 'maio-ext';

let seq = 0;
function nextId(): string {
  seq += 1;
  return `${Date.now().toString(36)}-${seq}`;
}

/** 확장에 한 번 물어보고 답을 기다린다. 답이 없으면 설치 안 된 것(정상). */
function ask<T extends Record<string, unknown>>(
  body: T,
  timeoutMs: number,
): Promise<{ ok: boolean; version?: string; error?: string; note?: string }> {
  if (typeof window === 'undefined') return Promise.resolve({ ok: false });
  const reqId = nextId();
  return new Promise((resolve) => {
    const done = (r: { ok: boolean; version?: string; error?: string; note?: string }) => {
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
      resolve(r);
    };
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data as { source?: string; reqId?: string; ok?: boolean; version?: string; error?: string; note?: string };
      if (d?.source !== EXT || d.reqId !== reqId) return;
      done({ ok: Boolean(d.ok), version: d.version, error: d.error, note: d.note });
    };
    const timer = setTimeout(() => done({ ok: false, error: '확장이 응답하지 않습니다' }), timeoutMs);
    window.addEventListener('message', onMsg);
    window.postMessage({ source: WEB, reqId, ...body }, window.location.origin);
  });
}

/** 확장이 설치돼 있고 말이 통하는가. 설치 안 한 게 정상이므로 실패는 조용히 false. */
export async function detectExtension(timeoutMs = 1200): Promise<{ installed: boolean; version?: string }> {
  const r = await ask({ type: 'PING' }, timeoutMs);
  return r.ok ? { installed: true, version: r.version } : { installed: false };
}

/** 확장이 지금 채워 넣을 수 있는 채널 — 여기 없는 채널은 붙여넣기로 간다 */
export const ONE_CLICK_CHANNELS = ['blog', 'naver_place'] as const;
export type OneClickChannel = (typeof ONE_CLICK_CHANNELS)[number];
export function isOneClickChannel(ch?: string): ch is OneClickChannel {
  return !!ch && (ONE_CLICK_CHANNELS as readonly string[]).includes(ch);
}

/** 채널별로 버튼에 뭐라고 쓸지 — "블로그에 바로 채우기"가 플레이스에 뜨면 안 된다 */
export const ONE_CLICK_LABEL: Record<OneClickChannel, string> = {
  blog: '네이버 블로그에 바로 채우기',
  naver_place: '플레이스 소식에 바로 채우기',
};

export interface BlogDraftPayload {
  postId: string;
  /** 확장이 어느 화면을 열고 어떤 방식으로 채울지 결정한다 */
  channel: OneClickChannel;
  title: string;
  bodyHtml: string;
  bodyPlain: string;
  tags: string[];
  storeName: string;
}

/** 초안을 확장에 넘긴다. 확장이 네이버 글쓰기 탭을 열고 에디터에 채운다. */
export async function sendDraftToExtension(
  payload: BlogDraftPayload,
): Promise<{ ok: boolean; error?: string; note?: string }> {
  return ask({ type: 'DRAFT_READY', payload }, 8000);
}
