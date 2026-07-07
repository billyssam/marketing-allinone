import type { DraftContent, PublishResult } from '../../../shared/channels/adapter.js';

/**
 * 반자동(assisted) 채널 공통: 서버는 콘텐츠·딥링크만 준비.
 * 사장님이 카톡 알림 → 딥링크로 앱 열림 → 클립보드 붙여넣기.
 * (네이버 블로그에서 검증된 3단계 패턴을 전 채널로 일반화)
 */
export function buildHandoff(opts: {
  deeplink: string;
  draft: DraftContent;
  steps: string[];
  includeTags?: boolean;
}): PublishResult {
  const clipboard: { label: string; text: string }[] = [];
  if (opts.draft.title) clipboard.push({ label: '제목', text: opts.draft.title });
  if (opts.draft.bodyPlain || opts.draft.bodyHtml) {
    clipboard.push({ label: '본문', text: opts.draft.bodyPlain ?? stripHtml(opts.draft.bodyHtml!) });
  }
  if (opts.includeTags && opts.draft.tags?.length) {
    clipboard.push({ label: '태그', text: opts.draft.tags.map((t) => `#${t}`).join(' ') });
  }
  return {
    mode: 'assisted',
    ok: true,
    handoff: { deeplink: opts.deeplink, clipboard, steps: opts.steps },
  };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
