import { CHANNEL_BRIEF, hasConcreteFact, targetLength } from './channel-native';
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
  /**
   * 생성 때 고른 제목 스타일(`metadata.titleStyle`).
   * 'plain'은 **상호를 앞에 두어도 되는** 스타일이라 title-prefix를 면제한다 — 아래 설명 참고.
   */
  titleStyle?: string | null;
}

export interface QualityIssue {
  channel: string;
  rule: string;
  detail: string;
}

// 목표 분량도 브리프가 있는 쪽(channel-native)이 단일 원천이다 — 생성과 점검이 같은 값을 봐야 한다.
export { targetLength };

// 사실 판정은 생성 쪽(channel-native)의 `hasConcreteFact`와 **같은 잣대**를 쓴다.
// 두 벌로 두면 생성은 통과시키고 점검은 잡는(또는 그 반대) 어긋남이 생긴다.

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
    if (cid && mustHaveFacts.has(cid) && !hasConcreteFact(body)) {
      issues.push({ channel: label, rule: 'no-facts', detail: '가격·영업시간이 하나도 없음' });
    }

    // 4) 상호 뒤 조사 — 받침과 어긋나면 매장마다 절반이 틀린다
    const wrong = hasBatchim(storeName)
      ? [`${storeName}는`, `${storeName}가`, `${storeName}를`, `${storeName}예요`]
      : [`${storeName}은`, `${storeName}이 `, `${storeName}을`, `${storeName}이에요`];
    const hit = wrong.find((w) => body.includes(w) || (p.title ?? '').includes(w));
    if (hit) issues.push({ channel: label, rule: 'josa', detail: `조사 오류: "${hit}"` });

    // 5) 제목이 "지역명 상호," 틀로 시작 — 매일 이 틀이면 광고 전단처럼 읽힌다.
    //
    // ⚠️ 단, 제목 스타일 'plain'은 angles.ts가 **의도적으로 허용**하는 형태다
    //    ("상호를 앞에 두어도 되는 제목. 단 뒤 문구는 최근 제목과 완전히 다른 어휘로").
    //    이걸 모르고 무조건 잡는 바람에 로테이션이 plain을 고른 날 5개 채널이 통째로 결함으로 찍혔다
    //    (2026-08-15 무인 크론). **생성 규칙과 점검 규칙이 서로 모순이었다.**
    //    metadata.titleStyle을 넘겨주면 그날만 면제한다 — 넘어오지 않으면 예전처럼 엄격하게 본다.
    const title = (p.title ?? '').trim();
    if (
      title &&
      p.titleStyle !== 'plain' &&
      new RegExp(`^\\S*\\s*${escapeRe(storeName)}\\s*[,·]`).test(title)
    ) {
      issues.push({ channel: label, rule: 'title-prefix', detail: `제목이 상호로 시작: "${title.slice(0, 30)}"` });
    }
  }
  return issues;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
