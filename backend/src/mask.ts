import { createHash } from 'node:crypto';

/**
 * 매장 식별 정보 가리기 — **저장소가 공개일 때 사장님 정보가 새지 않게.**
 *
 * 왜 필요한가: 공개 저장소는 이슈뿐 아니라 **Actions 로그도 전부 공개**다.
 * 지금 크론들은 `[쿵더쿵] 크롤 9 · 저장 9` 처럼 매장 이름을 그대로 찍고,
 * 주간 다이제스트는 상호·발행 실적·미답변 리뷰 수까지 이슈 본문에 넣는다.
 * 파일럿 사장님이 들어오면 **그분 상호와 장사 실적이 인터넷에 공개**된다.
 *
 * 그래서 CI에서는 이름 대신 **안정적인 짧은 별칭**을 쓴다.
 * 별칭은 매장 id의 해시라 실행이 바뀌어도 같은 매장은 같은 이름으로 보인다 —
 * 로그를 읽는 사람이 "어느 매장이 계속 실패하는가"는 알 수 있어야 진단이 된다.
 * 실제 상호가 필요하면 **로컬에서 그냥 돌리면 된다**(플래그가 없으면 실명).
 *
 * 켜는 법: 워크플로 env에 `MASK_STORE_NAMES: 'true'`.
 */
const MASK = process.env.MASK_STORE_NAMES === 'true';

/** 매장 id → 안정적인 4자 별칭 */
function alias(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 4);
}

/** 로그·알림에 쓸 매장 표기. 가려야 하면 `매장 a3f1`, 아니면 실제 상호 */
export function storeLabel(store: { id: string; name?: string | null }): string {
  if (!MASK) return store.name ?? store.id.slice(0, 8);
  return `매장 ${alias(store.id)}`;
}

/** 지금 가리는 중인가 — 호출부가 "자세한 내용은 로컬에서" 안내를 붙일 때 쓴다 */
export const isMasked = MASK;
