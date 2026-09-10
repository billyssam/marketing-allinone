import type { ChannelId } from './registry';
import { canVerifyKey } from './readiness';
import { verifySmartstoreKey } from './smartstore-api';

/**
 * 사장님이 붙여넣은 키가 **진짜 도는지** 저장 전에 확인한다.
 *
 * 🔴 왜 필요한가: 예전엔 저장만 하고 `status: 'connected'` 를 적었다.
 *    오타 하나면 화면은 "키가 등록돼 있어요"라고 말하고, 사장님은 한 달 뒤
 *    지표가 비어 있을 때까지 모른다. **저장하는 순간에 판정**해야 한다.
 *
 * 범용성: 채널이 늘어도 여기 한 줄만 추가하면 모든 화면이 같은 판정을 쓴다.
 * 확인할 방법이 아직 없는 채널은 **`checked: false`** 로 정직하게 돌려준다 —
 * "확인 못 했다"와 "확인했더니 된다"를 섞으면 그게 다음 거짓말의 씨앗이다.
 */
export interface KeyVerdict {
  /** 실제로 외부 서비스에 물어봤는가 */
  checked: boolean;
  /** checked=true 일 때만 뜻이 있다 */
  ok: boolean;
  /** 사장님에게 보여줄 확인 문구(예: 스토어 이름) */
  label?: string;
  externalId?: string;
  error?: string;
}

export async function verifyChannelKey(
  channelId: ChannelId | string,
  values: Record<string, string>,
): Promise<KeyVerdict> {
  if (!canVerifyKey(channelId)) {
    // 카카오 채널 아이디처럼, 우리 쪽에서 눌러 볼 방법이 아직 없는 것들
    return { checked: false, ok: false };
  }

  if (channelId === 'smartstore') {
    const { clientId, clientSecret } = values;
    if (!clientId || !clientSecret) {
      return { checked: true, ok: false, error: '두 칸을 모두 채워주세요.' };
    }
    const res = await verifySmartstoreKey(clientId, clientSecret);
    return res.ok
      ? { checked: true, ok: true, label: res.storeName, externalId: res.externalId }
      : {
          checked: true,
          ok: false,
          // 사장님에게 네이버 원문 오류를 그대로 던지지 않는다 — 무슨 뜻인지 모른다
          error: '판매자센터에서 발급받은 값이 맞는지 다시 확인해주세요.',
        };
  }

  // 목록에 올려 놓고 갈래를 안 만든 경우 — 조용히 통과시키지 않는다
  return { checked: true, ok: false, error: '아직 확인할 수 없는 채널이에요.' };
}
