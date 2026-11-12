import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChannelId } from '@shared/channels/registry';
import type { ChannelDraftBundle } from '@shared/content-engine/orchestrator';
import { type PostChannel, CHANNEL_TO_POST } from '@shared/channels/registry';
import { safeDraftHtml } from '@shared/safe-html';
import { checkPosts } from '@shared/content-engine/quality';

// posts.channel enum·매핑은 shared/channels/registry가 단일 원천 → 재수출
export type { PostChannel };

/** posts.status enum (0001_init.sql: post_status) */
export type PostStatus = 'draft' | 'ready' | 'sent_to_owner' | 'published' | 'failed' | 'archived';

/** PostChannel 표기 — UI 단일 진실원천(Record 완전성으로 enum 추가 시 컴파일 강제) */
export const POST_CHANNEL_LABEL: Record<PostChannel, string> = {
  blog: '네이버 블로그',
  instagram: '인스타그램',
  facebook: '페이스북',
  google_gbp: '구글 비즈니스',
  threads: '스레드',
  naver_place: '네이버 플레이스',
  danggeun: '당근마켓',
  naver_band: '네이버 밴드',
  kakao_channel: '카카오 채널',
};
export const POST_CHANNEL_COLOR: Record<PostChannel, string> = {
  blog: 'var(--color-naver)',
  instagram: 'var(--color-ig)',
  facebook: 'var(--color-ig)',
  google_gbp: 'var(--color-amber)',
  threads: 'var(--color-fg-2)',
  naver_place: 'var(--color-naver)',
  danggeun: 'var(--color-amber)',
  naver_band: 'var(--color-naver)',
  kakao_channel: 'var(--color-amber)',
};
export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  draft: '초안',
  ready: '발행 준비',
  sent_to_owner: '카톡 전송됨',
  published: '게시 확인',
  failed: '실패',
  archived: '보관',
};

/**
 * 목록에 보여줄 초안 제목.
 * 인스타는 캡션 단일이라 title이 null — "(제목 없음)" 대신 캡션 첫 줄을 제목처럼 쓴다.
 */
export function postDisplayTitle(p: { title?: string | null; body_plain?: string | null }): string {
  const t = (p.title ?? '').trim();
  if (t) return t;
  const first = (p.body_plain ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!first) return '(내용 없음)';
  return first.length > 46 ? `${first.slice(0, 46)}…` : first;
}

/**
 * 콘텐츠 엔진의 ChannelId → posts.channel enum 매핑 (shared 재수출, 하위호환 별칭).
 * enum에 없는 채널(naver_place·danggeun 등)은 posts로 영속화하지 않는다(핸드오프 전용).
 */
export const CHANNEL_TO_POST_CHANNEL = CHANNEL_TO_POST;

export interface PersistedPost {
  reviewRequired: boolean;
  id: string;
  channel: PostChannel;
  engineChannel: ChannelId;
  title: string | null;
  status: string;
}

/**
 * 생성된 채널 드래프트 번들을 posts 테이블에 영속화한다.
 * post_channel enum으로 매핑되는 채널만 저장하며, status='draft'로 들어간다.
 * @param supabase RLS 적용 사용자 클라이언트(store 소유자여야 insert 성공)
 * @returns 저장된 post row 요약 (매핑 안 되는 채널은 제외)
 */
export async function persistDrafts(
  supabase: SupabaseClient,
  storeId: string,
  bundle: ChannelDraftBundle,
  storeName = '',
): Promise<PersistedPost[]> {
  const quality = checkPosts(Object.entries(bundle.perChannel).map(([channel, draft]) => ({
    channel, title: draft?.title ?? null, bodyPlain: draft?.bodyPlain ?? '',
  })), storeName, { storeHasFacts: false });
  // Empty output must not become a successful, billable-looking draft.
  if (quality.some((issue) => issue.rule === 'empty')) throw new Error('생성된 본문이 비어 있어 저장하지 않았어요.');
  const needsReview = quality.some((issue) => issue.severity === 'critical') || Boolean(bundle.salvaged);
  const rows = Object.entries(bundle.perChannel)
    .map(([engineChannel, draft]) => {
      const channel = CHANNEL_TO_POST_CHANNEL[engineChannel as ChannelId];
      if (!channel || !draft) return null;
      return {
        store_id: storeId,
        channel,
        title: draft.title ?? null,
        body_html: draft.bodyHtml ? safeDraftHtml(draft.bodyHtml) : null,
        body_plain: draft.bodyPlain ?? null,
        tags: draft.tags ?? [],
        status: 'draft' as const,
        metadata: {
          engineChannel,
          native: draft.meta?.native === true,
          qualityNotes: bundle.master.qualityNotes ?? [],
          degraded: bundle.degraded,
          salvaged: bundle.salvaged,
          quality,
          reviewRequired: needsReview,
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('posts')
    .insert(rows)
    .select('id, channel, title, status, metadata');

  // One PostgREST INSERT is transactional. Never retry individually after an
  // uncertain response: it can silently omit channels or duplicate saved drafts.
  if (error || data?.length !== rows.length) throw new Error('선택한 채널의 초안을 모두 저장하지 못했어요. 목록을 확인한 뒤 다시 시도해주세요.');

  return (data ?? []).map((d) => ({
    id: d.id as string,
    channel: d.channel as PostChannel,
    engineChannel: (d.metadata?.engineChannel ?? d.channel) as ChannelId,
    title: (d.title ?? null) as string | null,
    status: d.status as string,
    reviewRequired: d.metadata?.reviewRequired === true,
  }));
}

export interface PrepareDraft {
  reviewRequired?: boolean;
  qualityNotes?: string[];
  storeName: string;
  channel: PostChannel;
  title: string;
  bodyHtml: string;
  bodyPlain: string;
  tags: string[];
  status: string;
}

/**
 * /prepare 복붙 도우미용 단건 조회.
 * 로그인한 사용자의 RLS 클라이언트로 조회한다. 링크 보유만으로 접근을 허용하지 않는다.
 */
export async function getPreparePost(
  supabase: SupabaseClient,
  postId: string,
): Promise<PrepareDraft | null> {
  const { data, error } = await supabase
    .from('posts')
    .select('title, body_html, body_plain, tags, channel, status, metadata, stores(name)')
    .eq('id', postId)
    .maybeSingle();

  if (error) throw new Error(`초안 조회 실패: ${error.message}`);
  if (!data) return null;

  const store = data.stores as { name?: string } | { name?: string }[] | null;
  const storeName = Array.isArray(store) ? store[0]?.name : store?.name;

  return {
    storeName: storeName ?? '내 매장',
    reviewRequired: data.metadata?.reviewRequired === true,
    qualityNotes: [
      ...(Array.isArray(data.metadata?.qualityNotes) ? data.metadata.qualityNotes.filter((note: unknown) => typeof note === 'string') : []),
      ...(data.metadata?.degraded ? ['다른 모델로 생성한 초안입니다. 내용을 확인해주세요.'] : []),
      ...(data.metadata?.salvaged ? ['응답을 복구한 초안입니다. 문장이 끝까지 작성됐는지 확인해주세요.'] : []),
    ],
    channel: data.channel as PostChannel,
    title: data.title ?? '',
    bodyHtml: safeDraftHtml(data.body_html ?? ''),
    bodyPlain: data.body_plain ?? '',
    tags: (data.tags ?? []) as string[],
    status: data.status as string,
  };
}
