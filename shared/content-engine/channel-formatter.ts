import type { DraftContent } from '../channels/adapter';
import type { ChannelId } from '../channels/registry';
import type { DraftOutput } from './types';

/**
 * 마스터 콘텐츠(블로그 기준 DraftOutput) → 채널별 DraftContent 변환.
 * 사진 1장·매장정보 하나로 만든 마스터를 각 채널 포맷에 맞게 재단한다.
 *
 * 채널별 규칙:
 *  - naver_blog       : 풀 (title + bodyHtml + tags 전부 + 사진 순서)
 *  - naver_place      : 소식 단문 (~300자 plain, 사진 1~2, 태그 없음)
 *  - instagram        : 캡션(훅+요약) + 해시태그(최대 30) + 사진
 *  - danggeun         : 동네 홍보 친근 단문 (~500자, 해시태그 없음)
 *  - threads          : 짧은 후킹 (~450자)
 *  - facebook/google  : 중간 길이 + 사진
 *  - 기타             : title + plain + tags
 */

export interface MasterImage {
  url: string;
  alt?: string;
}

export function formatForChannel(
  draft: DraftOutput,
  channelId: ChannelId,
  images: MasterImage[] = [],
): DraftContent {
  const plain = htmlToPlain(draft.bodyHtml);
  const ordered = orderImages(images, draft.suggestedPhotoOrder);

  switch (channelId) {
    case 'naver_blog':
      return {
        title: draft.title,
        bodyHtml: draft.bodyHtml,
        bodyPlain: plain,
        tags: draft.tags,
        images: ordered,
        meta: { format: 'blog', length: plain.length },
      };

    case 'naver_place':
      return {
        bodyPlain: condense(plain, 300),
        images: ordered.slice(0, 3),
        meta: { format: 'place_news' },
      };

    case 'instagram': {
      const caption = buildCaption(draft, plain, 600);
      return {
        bodyPlain: `${caption}\n\n${hashtags(draft.tags, 30)}`,
        tags: draft.tags.slice(0, 30),
        images: ordered.length ? ordered : [],
        meta: { format: 'ig_caption' },
      };
    }

    case 'danggeun':
      return {
        title: draft.title,
        bodyPlain: condense(plain, 500),
        images: ordered.slice(0, 5),
        meta: { format: 'danggeun_local' },
      };

    case 'threads':
      return { bodyPlain: buildCaption(draft, plain, 450), images: ordered.slice(0, 1), meta: { format: 'threads' } };

    case 'facebook':
    case 'google_business':
    case 'kakao_channel':
      return {
        title: draft.title,
        bodyPlain: condense(plain, 700),
        images: ordered.slice(0, 4),
        meta: { format: 'social_medium' },
      };

    default:
      return { title: draft.title, bodyPlain: condense(plain, 800), tags: draft.tags, images: ordered };
  }
}

/** 여러 채널 한 번에 */
export function formatForChannels(
  draft: DraftOutput,
  channelIds: ChannelId[],
  images: MasterImage[] = [],
): Record<string, DraftContent> {
  const out: Record<string, DraftContent> = {};
  for (const id of channelIds) out[id] = formatForChannel(draft, id, images);
  return out;
}

// ---------- helpers ----------

export function htmlToPlain(html: string): string {
  return html
    .replace(/<h[1-6][^>]*>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<br\s*\/?>(?=)/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n· ')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 문장 경계에서 자르기 */
export function condense(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '), cut.lastIndexOf('요 '), cut.lastIndexOf('다 '));
  return (lastStop > maxChars * 0.5 ? cut.slice(0, lastStop + 1) : cut).trim() + ' …';
}

/** 인스타/스레드 캡션: 첫 문단(훅) 중심으로 압축 */
function buildCaption(draft: DraftOutput, plain: string, max: number): string {
  const paragraphs = plain.split(/\n\n+/).filter(Boolean);
  const hook = paragraphs[0] ?? plain;
  const body = paragraphs.slice(1).join(' ');
  const combined = body ? `${hook}\n\n${body}` : hook;
  return condense(combined, max);
}

function hashtags(tags: string[], limit: number): string {
  return tags.slice(0, limit).map((t) => `#${t.replace(/\s+/g, '')}`).join(' ');
}

function orderImages(images: MasterImage[], order?: number[]): MasterImage[] {
  if (!order?.length) return images;
  const seen = new Set<number>();
  const out: MasterImage[] = [];
  for (const i of order) {
    if (images[i] && !seen.has(i)) { out.push(images[i]); seen.add(i); }
  }
  images.forEach((img, i) => { if (!seen.has(i)) out.push(img); });
  return out;
}
