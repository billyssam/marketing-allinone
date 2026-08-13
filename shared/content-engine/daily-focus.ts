import { CHANNELS, type ChannelId } from '../channels/registry';

/**
 * 오늘의 우선순위 — 초안이 여러 개일 때 "이거 하나만이라도 하세요"를 골라준다.
 *
 * 왜 필요한가(실측): 채널을 8개 연결하면 아침 브리핑에 붙여넣기가 8건 뜬다.
 * 사장님이 매일 8번을 할 리 없고, 안 하면 그만큼 매일 '지나간 글'로 쌓인다
 * (주간 리포트에서 한 주 24건이 그렇게 사라진 게 실제로 관측됐다).
 * 전부 평평하게 나열하면 아무것도 안 하게 되므로, 하나를 골라 이유와 함께 앞에 세운다.
 *
 * 원칙
 * - 나머지를 **숨기지 않는다.** 다 하고 싶은 사장님을 막으면 안 된다(접어둘 뿐).
 * - **왜 이걸 권하는지** 반드시 같이 보여준다. 근거 없는 추천은 안 따른다.
 * - 업종을 가정하지 않는다 — 채널 효과와 방치 기간만 본다.
 */

export interface FocusCandidate {
  postId: string;
  /** 레지스트리 채널 id (naver_blog·naver_place·instagram …) */
  channel: ChannelId;
  title?: string | null;
  /** 이 채널에 마지막으로 발행한 시각(ISO). 없으면 한 번도 발행 안 함 */
  lastPublishedAt?: string | null;
}

export interface FocusItem extends FocusCandidate {
  channelName: string;
  color: string;
  /** 사장님에게 보여줄 추천 이유 */
  reason: string;
  /** 예상 소요 — 붙여넣기 단계 수에서 온다 */
  effort: string;
  score: number;
}

export interface DailyFocus {
  /** 오늘 하나만 한다면 이것 */
  primary?: FocusItem;
  /** 여유가 되면 하나 더 */
  secondary?: FocusItem;
  /** 나머지(접어서 보여줌) */
  rest: FocusItem[];
}

const DAY = 86_400_000;

/** 블로그만 제목·본문·태그 3단계라 시간이 더 든다 */
function effortOf(channel: ChannelId): string {
  return channel === 'naver_blog' ? '1분' : '30초';
}

/**
 * 점수 = 채널 기본 효과 + 방치 보너스.
 * 채널 효과는 레지스트리 priority를 단일 원천으로 쓴다(여기서 새로 정하지 않는다).
 */
function scoreOf(c: FocusCandidate, nowMs: number): { score: number; reason: string } {
  const meta = CHANNELS.find((x) => x.id === c.channel);
  const weight = Math.max(0, 20 - (meta?.priority ?? 20));

  if (!c.lastPublishedAt) {
    // 한 번도 안 올린 채널이 가장 아깝다 — 첫 글이 있어야 검색에 잡히기 시작한다
    return {
      score: weight + 15,
      // '이 채널엔'을 빼면 매일 올린 사장님이 "아직 한 번도 안 올리셨어요"를 보고 당황한다
      reason: `이 채널엔 아직 한 번도 안 올리셨어요. 첫 글이 있어야 검색에 잡히기 시작해요`,
    };
  }
  const days = Math.floor((nowMs - Date.parse(c.lastPublishedAt)) / DAY);
  // 상한은 채널 효과 차이(최대 19)보다 커야 한다. 14로 뒀더니 플레이스가 매일 1순위로
  // 고정돼 나머지 채널이 영원히 방치됐다(실측) — 오래 묵으면 결국 올라오게 24로.
  const stale = Math.min(24, Math.max(0, days) * 2);
  if (days >= 7) {
    return { score: weight + stale, reason: `${days}일째 새 글이 없어요` };
  }
  if (days >= 3) {
    return { score: weight + stale, reason: `마지막 발행이 ${days}일 전이에요` };
  }
  return { score: weight + stale, reason: reasonForChannel(c.channel) };
}

/** 방치가 아닐 때는 채널 자체의 효과를 이유로 든다 */
function reasonForChannel(channel: ChannelId): string {
  switch (channel) {
    case 'naver_place':
      return '지역 검색에서 손님이 가장 먼저 보는 자리예요';
    case 'naver_blog':
      return '검색에 오래 남아 계속 손님을 데려와요';
    case 'instagram':
      return '새 손님이 가게 분위기를 확인하는 곳이에요';
    case 'danggeun':
      return '동네 손님에게 바로 닿아요';
    case 'kakao_channel':
      return '이미 친구 추가한 단골 알림창에 바로 떠요';
    case 'naver_band':
      return '단골 모임에 소식이 그대로 전달돼요';
    case 'google_business':
      return '지도에서 찾아오는 손님이 봐요';
    default:
      return '오늘 올리기 좋아요';
  }
}

export function pickDailyFocus(candidates: FocusCandidate[], nowMs: number): DailyFocus {
  const ranked: FocusItem[] = candidates
    .map((c) => {
      const meta = CHANNELS.find((x) => x.id === c.channel);
      const { score, reason } = scoreOf(c, nowMs);
      return {
        ...c,
        channelName: meta?.name ?? c.channel,
        color: meta?.color ?? 'var(--color-fg-2)',
        reason,
        effort: effortOf(c.channel),
        score,
      };
    })
    // 동점이면 채널 우선순위가 높은 쪽(=priority 작은 쪽)이 앞. 결정적 정렬이라 매일 흔들리지 않는다.
    .sort((a, b) => b.score - a.score || a.channel.localeCompare(b.channel));

  return { primary: ranked[0], secondary: ranked[1], rest: ranked.slice(2) };
}
