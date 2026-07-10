import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChannelId } from '@shared/channels/registry';
import type { ChannelDraftBundle } from '@shared/content-engine/orchestrator';

/** posts.channel enum (0001_init.sql: post_channel) */
export type PostChannel = 'blog' | 'instagram' | 'facebook' | 'google_gbp' | 'threads';

/** posts.status enum (0001_init.sql: post_status) */
export type PostStatus = 'draft' | 'ready' | 'sent_to_owner' | 'published' | 'failed' | 'archived';

/** PostChannel 표기 — UI 단일 진실원천(Record 완전성으로 enum 추가 시 컴파일 강제) */
export const POST_CHANNEL_LABEL: Record<PostChannel, string> = {
  blog: '네이버 블로그',
  instagram: '인스타그램',
  facebook: '페이스북',
  google_gbp: '구글 비즈니스',
  threads: '스레드',
};
export const POST_CHANNEL_COLOR: Record<PostChannel, string> = {
  blog: 'var(--color-naver)',
  instagram: 'var(--color-ig)',
  facebook: 'var(--color-ig)',
  google_gbp: 'var(--color-amber)',
  threads: 'var(--color-fg-2)',
};
export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  draft: '초안',
  ready: '발행 준비',
  sent_to_owner: '카톡 전송됨',
  published: '발행 완료',
  failed: '실패',
  archived: '보관',
};

/**
 * 콘텐츠 엔진의 ChannelId → posts.channel enum 매핑.
 * enum에 없는 채널(naver_place·danggeun 등)은 posts로 영속화하지 않는다(핸드오프 전용).
 */
export const CHANNEL_TO_POST_CHANNEL: Partial<Record<ChannelId, PostChannel>> = {
  naver_blog: 'blog',
  instagram: 'instagram',
  facebook: 'facebook',
  google_business: 'google_gbp',
  threads: 'threads',
};

export interface PersistedPost {
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
): Promise<PersistedPost[]> {
  const rows = Object.entries(bundle.perChannel)
    .map(([engineChannel, draft]) => {
      const channel = CHANNEL_TO_POST_CHANNEL[engineChannel as ChannelId];
      if (!channel || !draft) return null;
      return {
        store_id: storeId,
        channel,
        title: draft.title ?? null,
        body_html: draft.bodyHtml ?? null,
        body_plain: draft.bodyPlain ?? null,
        tags: draft.tags ?? [],
        status: 'draft' as const,
        metadata: {
          engineChannel,
          native: draft.meta?.native === true,
          qualityNotes: bundle.master.qualityNotes ?? [],
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from('posts')
    .insert(rows)
    .select('id, channel, title, status, metadata');

  if (error) throw new Error(`posts 저장 실패: ${error.message}`);

  return (data ?? []).map((d) => ({
    id: d.id as string,
    channel: d.channel as PostChannel,
    engineChannel: (d.metadata?.engineChannel ?? d.channel) as ChannelId,
    title: (d.title ?? null) as string | null,
    status: d.status as string,
  }));
}

export interface PrepareDraft {
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
 * 카톡 딥링크로 로그인 세션 없이 열릴 수 있으므로 서비스롤 클라이언트로 UUID 단건만 조회한다.
 * (post id는 추측 불가한 UUID → 핸드오프 링크 소유자만 접근)
 */
export async function getPreparePost(
  supabase: SupabaseClient,
  postId: string,
): Promise<PrepareDraft | null> {
  const { data, error } = await supabase
    .from('posts')
    .select('title, body_html, body_plain, tags, channel, status, stores(name)')
    .eq('id', postId)
    .maybeSingle();

  if (error) throw new Error(`초안 조회 실패: ${error.message}`);
  if (!data) return null;

  const store = data.stores as { name?: string } | { name?: string }[] | null;
  const storeName = Array.isArray(store) ? store[0]?.name : store?.name;

  return {
    storeName: storeName ?? '내 매장',
    channel: data.channel as PostChannel,
    title: data.title ?? '',
    bodyHtml: data.body_html ?? '',
    bodyPlain: data.body_plain ?? '',
    tags: (data.tags ?? []) as string[],
    status: data.status as string,
  };
}
