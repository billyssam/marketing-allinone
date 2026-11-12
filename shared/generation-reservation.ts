import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const MANUAL_GENERATION_LIMIT = 8;
export class GenerationReservationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
function key(value: string): string {
  const hex = createHash('sha256').update(`marketing-generation-v1:${value}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
/** Serialize first-time store setup across tabs/functions, including redirects. */
export async function reserveOnboarding(admin: SupabaseClient, ownerId: string, now = Date.now()) {
  const id = key(`onboarding:${ownerId}`); const requestId = randomUUID();
  const { error: cleanup } = await admin.from('activity_log').delete().eq('id', id).eq('event', 'onboarding_lease')
    .lt('created_at', new Date(now - 600000).toISOString());
  if (cleanup) throw new GenerationReservationError('매장 설정 상태를 확인하지 못했어요.', 503);
  const { error } = await admin.from('activity_log').insert({ id, owner_id: ownerId, event: 'onboarding_lease',
    created_at: new Date(now).toISOString(), detail: { requestId } });
  if (error) throw new GenerationReservationError(error.code === '23505'
    ? '매장 설정을 저장하고 있어요. 잠시 후 다시 확인해주세요.' : '매장 설정 상태를 확인하지 못했어요.', error.code === '23505' ? 409 : 503);
  return async () => {
    const { error } = await admin.from('activity_log').delete().eq('id', id).eq('event', 'onboarding_lease').eq('detail->>requestId', requestId);
    if (error) console.error('[onboarding] lease release failed');
  };
}
/** Distributed leases and attempt slots use activity_log's existing UUID primary
 * key, not a process-local mutex or read-then-count. Only server service clients
 * may write this table. Keep quota-attempt rows for at least the current KST day.
 * Failed provider/storage attempts consume a slot: they can still cost money.
 */
export async function reserveGeneration(admin: SupabaseClient, storeId: string, now = Date.now()) {
  const day = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const { data: store, error: storeError } = await admin.from('stores').select('owner_id').eq('id', storeId).maybeSingle();
  if (storeError || !store) throw new GenerationReservationError('매장 생성 상태를 확인하지 못했어요.', 503);
  const leaseId = key(`active:${storeId}`);
  const requestId = randomUUID();
  const createdAt = new Date(now).toISOString();
  // Hosted generation functions are bounded to 60s; retain abandoned leases for
  // ten minutes. Compare event as well as key so unrelated activity is untouched.
  const { error: cleanupError } = await admin.from('activity_log').delete().eq('id', leaseId)
    .eq('event', 'generation_lease').lt('created_at', new Date(now - 600000).toISOString());
  if (cleanupError) throw new GenerationReservationError('생성 상태를 확인하지 못했어요.', 503);
  const { error: leaseError } = await admin.from('activity_log').insert({
    id: leaseId, owner_id: store.owner_id, store_id: storeId, event: 'generation_lease',
    created_at: createdAt, detail: { requestId },
  });
  if (leaseError) throw new GenerationReservationError(
    leaseError.code === '23505' ? '이미 초안을 만들고 있어요. 완료 후 목록을 확인해주세요.' : '생성 상태를 확인하지 못했어요.',
    leaseError.code === '23505' ? 409 : 503,
  );
  const release = async () => {
    const { error } = await admin.from('activity_log').delete().eq('id', leaseId)
      .eq('event', 'generation_lease').eq('detail->>requestId', requestId);
    if (error) console.error('[generation] lease release failed');
  };
  try {
    for (let slot = 0; slot < MANUAL_GENERATION_LIMIT; slot++) {
      const { error } = await admin.from('activity_log').insert({
        id: key(`attempt:${storeId}:${day}:${slot}`), owner_id: store.owner_id, store_id: storeId,
        event: 'generation_attempt', created_at: createdAt, detail: { requestId, day, slot },
      });
      if (!error) return { requestId, release };
      if (error.code !== '23505') throw new GenerationReservationError('생성 한도를 확인하지 못했어요.', 503);
    }
    throw new GenerationReservationError(`오늘 직접 생성 한도(${MANUAL_GENERATION_LIMIT}회)를 다 썼어요. 실패한 요청도 한도에 포함되며 내일 다시 이용할 수 있어요.`, 429);
  } catch (error) { await release(); throw error; }
}
