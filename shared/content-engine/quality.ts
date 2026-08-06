import { CHANNEL_BRIEF } from './channel-native';
import { CHANNELS, channelIdOfPost } from '../channels/registry';
import { hasBatchim } from '../korean';

/**
 * 생성된 글의 품질 점검 — "조용히 나빠지는 것"을 잡는 최종 방어선.
 *
 * 왜 필요한가: 크론은 성공으로 찍히고 초안도 DB에 있는데 **내용이 나쁠 수** 있다.
 * 실제로 그런 일이 반복됐다 — 단문 채널에 사실이 하나도 안 들어가거나(8/5),
 * 제약을 잘못 걸어 분량이 절반으로 무너지거나(8/5), 상호 조사가 틀리거나(8/6).
 * 사람이 매일 눈으로 볼 수 없으므로(며칠씩 자리를 비운다) 규칙으로 매일 확인한다.
 *
 * 원칙
 * - **목표값을 새로 적지 않는다.** 분량은 CHANNEL_BRIEF에서 파싱한다(단일 원천).
 * - 업종을 가정하지 않는다.
 * - 애매한 건 통과시킨다 — 오탐이 잦으면 알림을 아예 안 보게 된다.
 */

export interface PostForCheck {
  channel: string;
  title?: string | null;
  bodyPlain?: string | null;
}

export interface QualityIssue {
  channel: string;
  rule: string;
  detail: string;
}

/** 브리프 문자열의 `**150~250자**`에서 목표 범위를 뽑는다 */
export function targetLength(channelId: string): [number, number] | null {
  const brief = CHANNEL_BRIEF[channelId];
  if (!brief) return null;
  const m = brief.match(/\*\*(\d{2,4})\s*~\s*(\d{2,4})자/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** 숫자 사실(가격·시간·전화)이 하나라도 인용됐는가 */
const FACT_RE = /[\d,]{3,}\s*원|\d{2,3}-\d{3,4}-\d{4}|\d{1,2}\s*시|\d{1,2}:\d{2}/;

/**
 * @param storeName 조사 검사에 쓴다(상호 뒤 조사가 틀리면 매장마다 절반이 틀린다)
 * @param requireFacts 사실 주입을 강제할 채널(정보 채널). 나머지는 없어도 통과.
 */
export function checkPosts(
  posts: PostForCheck[],
  storeName: string,
  opts: { requireFacts?: string[]; storeHasFacts?: boolean } = {},
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  // 매장이 가진 사실이 아예 없으면(플레이스 미연결 + 항목 미입력) 넣을 게 없어서 못 넣는 것이다.
  // 그걸 매일 결함으로 올리면 고칠 수도 없는 알림이 쌓여 전체를 안 보게 된다.
  const mustHaveFacts = new Set(
    opts.storeHasFacts === false ? [] : (opts.requireFacts ?? ['naver_place', 'google_business']),
  );

  for (const p of posts) {
    const body = (p.bodyPlain ?? '').trim();
    const cid = channelIdOfPost(p.channel);
    const label = CHANNELS.find((c) => c.id === cid)?.name ?? p.channel;

    // 1) 빈 글 — 있어서는 안 되는 일
    if (!body) {
      issues.push({ channel: label, rule: 'empty', detail: '본문이 비어 있음' });
      continue;
    }

    // 2) 분량 — 하한만 본다. 상한 초과는 채널에 따라 자연스러울 수 있어 오탐이 된다(페북 실측).
    const range = cid ? targetLength(cid) : null;
    if (range && body.length < range[0] * 0.8) {
      issues.push({
        channel: label,
        rule: 'too-short',
        detail: `${body.length}자 (목표 ${range[0]}~${range[1]})`,
      });
    }

    // 3) 정보 채널인데 사실이 하나도 없음
    if (cid && mustHaveFacts.has(cid) && !FACT_RE.test(body)) {
      issues.push({ channel: label, rule: 'no-facts', detail: '가격·영업시간이 하나도 없음' });
    }

    // 4) 상호 뒤 조사 — 받침과 어긋나면 매장마다 절반이 틀린다
    const wrong = hasBatchim(storeName)
      ? [`${storeName}는`, `${storeName}가`, `${storeName}를`, `${storeName}예요`]
      : [`${storeName}은`, `${storeName}이 `, `${storeName}을`, `${storeName}이에요`];
    const hit = wrong.find((w) => body.includes(w) || (p.title ?? '').includes(w));
    if (hit) issues.push({ channel: label, rule: 'josa', detail: `조사 오류: "${hit}"` });

    // 5) 제목이 "지역명 상호," 틀로 시작 — 이 틀로 시작하면 실패한 제목이라고 못박아 뒀다
    const title = (p.title ?? '').trim();
    if (title && new RegExp(`^\\S*\\s*${escapeRe(storeName)}\\s*[,·]`).test(title)) {
      issues.push({ channel: label, rule: 'title-prefix', detail: `제목이 상호로 시작: "${title.slice(0, 30)}"` });
    }
  }
  return issues;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
