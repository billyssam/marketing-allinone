'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { verifyChannelKey } from '@shared/channels/key-verify';
import { CONTENT_CHANNELS } from '@shared/channels/registry';
import { refreshThreadsToken, socialConnectionUsable, threadsIdentity, verifyFacebookPage } from '@shared/channels/social-oauth';

/**
 * 채널 On/Off → channel_connections 영속화.
 * connect=true: upsert(status='pending'), false: delete. (실제 OAuth/토큰 연동은 채널별 후속)
 * RLS: "owner reads own channels" for all → 소유자만.
 */
export async function toggleChannel(
  channelId: string,
  connect: boolean,
): Promise<{ ok?: true; error?: string }> {
  if (!CONTENT_CHANNELS.some((id) => id === channelId)) return { error: '지금 선택할 수 없는 초안 채널이에요.' };
  if (channelId === 'naver_blog' && !connect) return { error: '블로그는 기본 초안 채널이에요.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: store, error: storeErr } = await supabase
    .from('stores')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (storeErr) return { error: '매장 정보를 확인하지 못했어요. 잠시 후 다시 시도해주세요.' };
  if (!store) return { error: '매장이 없습니다.' };

  if (connect) {
    const { error } = await supabase
      .from('channel_connections')
      .upsert({ store_id: store.id, channel_id: channelId, status: 'pending' }, { onConflict: 'store_id,channel_id' });
    if (error) return { error: '초안 채널을 저장하지 못했어요. 다시 시도해주세요.' };
  } else {
    const { error } = await supabase
      .from('channel_connections')
      .delete()
      .eq('store_id', store.id)
      .eq('channel_id', channelId);
    if (error) return { error: '초안 채널 선택을 해제하지 못했어요. 다시 시도해주세요.' };
  }

  revalidatePath('/channels');
  revalidatePath('/dashboard');
  return { ok: true };
}

/**
 * 사장님이 발급한 API 키를 저장한다.
 *
 * ⚠️ 이건 **사장님 소유의 비밀**이다. 다루는 규칙:
 *  - 비밀번호가 아니라 **발급 키**만 받는다(로그인 대행을 하지 않으므로 비밀번호가 필요 없다).
 *  - `channel_connections`에 저장하고 RLS가 매장 소유자만 읽게 막는다.
 *  - **되돌려주지 않는다** — 화면은 "키가 등록돼 있어요"만 알고, 값은 다시 못 읽는다.
 *  - 로그에 찍지 않는다(공개 저장소라 더더욱).
 */
export async function saveChannelKey(
  channelId: string,
  values: Record<string, string>,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: '로그인이 필요합니다.' };

  const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).maybeSingle();
  if (!store) return { error: '매장이 없습니다.' };

  const cleaned = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, (v ?? '').trim()]).filter(([, v]) => v),
  );
  if (!Object.keys(cleaned).length) return { error: '값을 입력해주세요.' };

  /**
   * 🔴 저장 전에 **실제로 눌러 본다.**
   * 예전엔 무조건 `status: 'connected'` 로 적었다 — 오타 난 키도 "등록됐어요"가 됐고,
   * 사장님은 지표가 빌 때까지 몰랐다. 확인할 방법이 있으면 확인하고,
   * 없으면 `pending` 으로 정직하게 남긴다(둘을 섞지 않는다).
   */
  const verdict = await verifyChannelKey(channelId, cleaned);
  if (verdict.checked && !verdict.ok) return { error: verdict.error ?? '확인하지 못했어요.' };

  const { error } = await supabase
    .from('channel_connections')
    .upsert(
      {
        store_id: store.id,
        channel_id: channelId,
        status: verdict.checked ? 'connected' : 'pending',
        // 키 묶음은 access_token 에 JSON 으로 — 채널마다 필요한 값 개수가 달라 칸을 나눌 수 없다
        access_token: JSON.stringify(cleaned),
        metadata: {
          savedAt: new Date().toISOString(),
          fields: Object.keys(cleaned),
          verified: verdict.checked,
          ...(verdict.label ? { storeName: verdict.label } : {}),
          ...(verdict.externalId ? { externalId: verdict.externalId } : {}),
        },
      },
      { onConflict: 'store_id,channel_id' },
    );
  if (error) return { error: error.message };

  revalidatePath('/channels');
  revalidatePath('/dashboard');
  return { ok: true };
}

/** Customer session + owned store + RLS on every operation; no provider-wide revocation. */
export async function manageSocialConnection(
  channelId: string, operation: 'verify' | 'refresh' | 'disconnect',
): Promise<{ ok?: true; error?: string; message?: string }> {
  if (!['facebook', 'threads'].includes(channelId) || !['verify', 'refresh', 'disconnect'].includes(operation)) return { error: '지원하지 않는 연결 작업이에요.' };
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return { error: '로그인이 필요합니다.' };
    const { data: store, error: storeError } = await supabase.from('stores').select('id').eq('owner_id', user.id).maybeSingle();
    if (storeError || !store) return { error: '내 매장을 확인하지 못했어요.' };
    const query = () => supabase.from('channel_connections');
    if (operation === 'disconnect') {
      const { error } = await query().update({ status: 'pending', access_token: null, refresh_token: null, external_id: null,
        expires_at: null, metadata: { disconnectedAt: new Date().toISOString(), providerPermissionsRevoked: false } })
        .eq('store_id', store.id).eq('channel_id', channelId);
      if (error) return { error: '연결 해제를 저장하지 못했어요.' };
      revalidatePath('/channels');
      return { ok: true, message: '이 서비스의 계정 연결을 해제했어요. 외부 서비스의 앱 권한은 해당 서비스 설정에서 관리할 수 있어요.' };
    }
    const { data: connection, error: readError } = await query().select('status, access_token, external_id, expires_at, metadata')
      .eq('store_id', store.id).eq('channel_id', channelId).maybeSingle();
    if (readError || !connection || !socialConnectionUsable(connection)) return { error: '연결이 없거나 만료됐어요. 계정을 다시 연결해주세요.' };
    if (operation === 'refresh') {
      if (channelId !== 'threads') return { error: '이 계정은 다시 연결해 갱신해주세요.' };
      const metadata = connection.metadata as Record<string, unknown> | null;
      if (typeof metadata?.tokenIssuedAt !== 'number' || typeof metadata?.tokenLifetimeSeconds !== 'number') return { error: '갱신 정보를 확인하지 못했어요. 다시 연결해주세요.' };
      const token = await refreshThreadsToken({ accessToken: connection.access_token!, issuedAt: metadata.tokenIssuedAt,
        expiresIn: metadata.tokenLifetimeSeconds, subjectId: connection.external_id! });
      await threadsIdentity(token.accessToken, connection.external_id!);
      // An in-flight refresh must not restore a disconnected/replaced token.
      const { data: updated, error } = await query().update({ access_token: token.accessToken,
        expires_at: new Date(token.issuedAt + token.expiresIn * 1000).toISOString(),
        metadata: { ...metadata, tokenIssuedAt: token.issuedAt, tokenLifetimeSeconds: token.expiresIn, identityVerified: true } })
        .eq('store_id', store.id).eq('channel_id', channelId).eq('status', 'connected')
        .eq('external_id', connection.external_id).eq('metadata->>tokenIssuedAt', String(metadata.tokenIssuedAt)).select('channel_id');
      if (error || updated?.length !== 1) return { error: '연결 상태가 바뀌었어요. 새로고침 후 다시 확인해주세요.' };
    } else if (channelId === 'threads') {
      await threadsIdentity(connection.access_token!, connection.external_id!);
    } else {
      await verifyFacebookPage({ id: connection.external_id!, name: '', accessToken: connection.access_token! });
    }
    revalidatePath('/channels');
    return { ok: true, message: operation === 'refresh' ? '계정 연결을 갱신했어요.' : '연결된 계정과 접근 권한을 다시 확인했어요.' };
  } catch { return { error: channelId === 'threads' && operation === 'refresh'
    ? '갱신을 완료하지 못했어요. 갱신은 발급 하루 뒤부터 가능하며, 만료된 계정은 다시 연결해주세요.'
    : '연결된 계정을 확인하지 못했어요. 잠시 후 다시 시도하거나 계정을 다시 연결해주세요.' }; }
}
