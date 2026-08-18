import { CHANNEL_BRIEF, hasConcreteFact, notOwnerVoice, targetLength } from './channel-native';
import { CHANNELS, channelIdOfPost } from '../channels/registry';
import { seasonalContext } from './seasonal';
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
 * - **글 하나만 보지 않는다.** 한 장씩 보면 다 괜찮고 붙여놓아야 같은 얼굴이 보인다(아래 세트 검수).
 */

/**
 * 결함의 무게.
 *
 * 왜 나누는가(2026-08-13): 초안 12건을 사람이 정독해서 결함 6건을 찾았는데
 * 이 점검은 전부 초록불이었다. 그때 잡힌 것들 — 8월에 "동절기 영업", 사장님이
 * 자기 가게를 3인칭으로 추천, 답글 8건이 통째로 같은 문장 — 은 조사 오류와
 * **같은 무게로 배열에 담길 성질이 아니다.** 조사는 고쳐서 내보내면 되지만
 * 화자가 무너진 글은 내보내는 순간 계정이 위험해진다.
 *
 * - `critical` … 건수·점수와 무관하게 **내보내면 안 되는 것**. 하나라도 있으면 막는다.
 * - `warn` … 고쳐서 내보내는 것. 쌓이면 보지만 한 건이 발행을 막지는 않는다.
 */
export type Severity = 'critical' | 'warn';

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
  severity: Severity;
}

// 목표 분량도 브리프가 있는 쪽(channel-native)이 단일 원천이다 — 생성과 점검이 같은 값을 봐야 한다.
export { targetLength };

// 사실 판정은 생성 쪽(channel-native)의 `hasConcreteFact`와 **같은 잣대**를 쓴다.
// 두 벌로 두면 생성은 통과시키고 점검은 잡는(또는 그 반대) 어긋남이 생긴다.

/** 발행을 막아야 하는 것만 추린다. */
export function criticalOf(issues: QualityIssue[]): QualityIssue[] {
  return issues.filter((i) => i.severity === 'critical');
}

/** 하나라도 있으면 내보내지 않는다. */
export function hasCritical(issues: QualityIssue[]): boolean {
  return issues.some((i) => i.severity === 'critical');
}

/**
 * 지금 계절과 **정반대** 계절을 가리키는 말.
 *
 * 왜 정반대만인가: 8월에 "곧 가을이라"는 자연스럽지만 8월에 "동절기 영업"은 틀린 것이다.
 * 인접 계절까지 잡으면 환절기 글이 매일 결함으로 찍힌다.
 * 왜 이 단어들만인가: "겨울 한정 메뉴 준비 중"처럼 계절 이름 자체는 미리 말할 수 있다.
 * **지금이 그 계절이어야만 쓰는 말**만 넣는다.
 */
const SEASON_MARKERS: Record<string, RegExp> = {
  겨울: /동절기|한파|폭설|첫눈|연말연시|송년|크리스마스|성탄/,
  여름: /폭염|무더위|장마|열대야|삼복|한여름|피서/,
  봄: /벚꽃|꽃샘추위|봄나들이/,
  가을: /단풍|늦가을|가을바람/,
};
const OPPOSITE_SEASON: Record<string, string> = {
  여름: '겨울',
  겨울: '여름',
  봄: '가을',
  가을: '봄',
};

/**
 * ⚠️ 계절어가 있다는 것만으로 잡으면 **업종을 하나 가정한 규칙**이 된다.
 *
 * 카페는 반대 계절을 미리 팔 일이 거의 없다. 그래서 카페 데이터만 보면 이 규칙이 완벽해 보인다.
 * 하지만 다음은 전부 정상 영업이고, 계절어만 보면 전부 발행이 막힌다.
 *   · 제과 — 8월에 "크리스마스 케이크 **예약** 받습니다"
 *   · 설비·수리 — 여름에 "**한파 대비** 배관 점검을 미리 하세요"
 *   · 파티룸·음식점 — "**송년회** 단체 예약 문의 주세요"
 *   · 펜션·여가 — 여름에 "**폭설** 시즌 대비 스노체인 대여 준비 중"
 * 미리 파는 것이 곧 영업인 업종이 많다.
 *
 * 실제 사고는 계절어 자체가 아니라 **지금 상태로 단정한 것**이었다 —
 * "동절기에는 저녁 8시까지 영업합니다"가 8월에 나갔다. 그래서 판정을 이렇게 나눈다.
 *   1) 예약·대비 같은 미래 표지가 있으면 통과한다(오탐 방지가 먼저다).
 *   2) 현재 운영을 단정하는 말이 있을 때만 막는다.
 *   3) 둘 다 없으면 통과한다 — 애매한 건 통과시킨다.
 */
// ⚠️ '부터'를 그냥 넣으면 "**오늘부터** 단축 운영합니다"까지 미래로 읽어 실제 사고를 놓친다.
//    날짜에 붙은 것만 미래다("12월부터 겨울 메뉴").
const FUTURE_MARKER = /예약|사전|미리|대비|준비|예정|곧\s|앞두고|다가[오올]|오픈|출시|모집|기다리|\d\s*[월일]\s*부터/;
const PRESENT_OPERATION = /영업|운영|라스트오더|이용\s*가능|오늘|지금|현재|시행/;

/** 반대 계절어가 "지금 그렇다"고 단정하는 문장에 들어 있는지. 아니면 undefined. */
function staleSeasonClaim(text: string, marker: RegExp): string | undefined {
  for (const raw of text.split(/[.!?\n]+/)) {
    const sentence = raw.trim();
    if (!sentence || !marker.test(sentence)) continue;
    if (FUTURE_MARKER.test(sentence)) continue; // 미리 파는 것은 정상 영업이다
    if (PRESENT_OPERATION.test(sentence)) return sentence;
  }
  return undefined;
}

/** 비교용 정규화 — 공백·문장부호를 지워 "같은 말"만 남긴다. */
function norm(s: string): string {
  return s.replace(/[\s.,!?·…"'"'"()[\]~-]/g, '');
}

/**
 * 서술 문장만 뽑는다.
 *
 * 사실 문장(가격·시간·전화)은 채널마다 **겹치는 게 정상**이라 뺀다 —
 * "수제대추차 5,800원 · 20:00에 라스트오더"는 여덟 채널에 똑같이 들어가야 맞다.
 * 판정 잣대는 생성 쪽과 같은 `hasConcreteFact`를 쓴다(두 벌로 두면 어긋난다).
 */
function proseSentences(text: string): string[] {
  return text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && !hasConcreteFact(s))
    .map(norm);
}

export interface DuplicatePair {
  a: string;
  b: string;
  /** 짧은 쪽 서술 문장 중 상대에게도 그대로 있는 비율 (0~1) */
  ratio: number;
  sample: string;
}

/**
 * 세트 안에서 서로 같은 말을 하는 것을 찾는다.
 *
 * 왜 필요한가(2026-08-13): 답글 8건이 통째로 같은 문장이었는데 점검은 통과했다.
 * 지금까지 이 파일은 글을 **하나씩 독립적으로만** 봤다 — 배열을 통째로 받아놓고
 * 한 번도 서로 비교하지 않았으니 구조적으로 잡을 수 없는 결함이었다.
 *
 * 답글·초안 어디서든 쓸 수 있게 순수 함수로 분리했다.
 */
export function findDuplicates(items: { label: string; text: string }[]): DuplicatePair[] {
  const prepared = items
    .map((it) => ({ label: it.label, full: norm(it.text ?? ''), sents: proseSentences(it.text ?? '') }))
    .filter((p) => p.full.length > 0);

  const out: DuplicatePair[] = [];
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i];
      const b = prepared[j];

      // 통째로 같은 경우 — 답글처럼 짧은 글은 문장 수가 적어 비율로는 안 잡힌다
      if (a.full === b.full) {
        out.push({ a: a.label, b: b.label, ratio: 1, sample: a.sents[0] ?? a.full.slice(0, 30) });
        continue;
      }

      // 서술 문장이 한 개뿐이면 우연히 겹칠 수 있다 — 두 개 이상일 때만 비율을 본다
      const min = Math.min(a.sents.length, b.sents.length);
      if (min < 2) continue;

      const setB = new Set(b.sents);
      const shared = a.sents.filter((s) => setB.has(s));
      const ratio = shared.length / min;
      if (ratio >= 0.7) {
        out.push({ a: a.label, b: b.label, ratio, sample: shared[0] ?? '' });
      }
    }
  }
  return out;
}

/**
 * @param storeName 조사 검사에 쓴다(상호 뒤 조사가 틀리면 매장마다 절반이 틀린다)
 * @param requireFacts 사실 주입을 강제할 채널(정보 채널). 나머지는 없어도 통과.
 * @param now 계절 판정 기준 시각. 넘기지 않으면 현재. 테스트에서 고정하려고 열어둔다.
 */
export function checkPosts(
  posts: PostForCheck[],
  storeName: string,
  opts: { requireFacts?: string[]; storeHasFacts?: boolean; now?: number } = {},
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  // 매장이 가진 사실이 아예 없으면(플레이스 미연결 + 항목 미입력) 넣을 게 없어서 못 넣는 것이다.
  // 그걸 매일 결함으로 올리면 고칠 수도 없는 알림이 쌓여 전체를 안 보게 된다.
  const mustHaveFacts = new Set(
    opts.storeHasFacts === false ? [] : (opts.requireFacts ?? ['naver_place', 'google_business']),
  );

  const season = seasonalContext(opts.now ?? Date.now()).season;
  const staleRe = SEASON_MARKERS[OPPOSITE_SEASON[season]];

  const labelOf = (channel: string) => {
    const cid = channelIdOfPost(channel);
    return CHANNELS.find((c) => c.id === cid)?.name ?? channel;
  };

  for (const p of posts) {
    const body = (p.bodyPlain ?? '').trim();
    const cid = channelIdOfPost(p.channel);
    const label = labelOf(p.channel);

    // 1) 빈 글 — 있어서는 안 되는 일. 사장님 화면에 빈 칸이 나가는 것이므로 막는다.
    if (!body) {
      issues.push({ channel: label, rule: 'empty', detail: '본문이 비어 있음', severity: 'critical' });
      continue;
    }

    // 2) 분량 — 하한만 본다. 상한 초과는 채널에 따라 자연스러울 수 있어 오탐이 된다(페북 실측).
    const range = cid ? targetLength(cid) : null;
    if (range && body.length < range[0] * 0.8) {
      issues.push({
        channel: label,
        rule: 'too-short',
        detail: `${body.length}자 (목표 ${range[0]}~${range[1]})`,
        severity: 'warn',
      });
    }

    // 3) 정보 채널인데 사실이 하나도 없음
    if (cid && mustHaveFacts.has(cid) && !hasConcreteFact(body)) {
      issues.push({
        channel: label,
        rule: 'no-facts',
        detail: '가격·영업시간이 하나도 없음',
        severity: 'warn',
      });
    }

    // 4) 상호 뒤 조사 — 받침과 어긋나면 매장마다 절반이 틀린다
    const wrong = hasBatchim(storeName)
      ? [`${storeName}는`, `${storeName}가`, `${storeName}를`, `${storeName}예요`]
      : [`${storeName}은`, `${storeName}이 `, `${storeName}을`, `${storeName}이에요`];
    const hit = wrong.find((w) => body.includes(w) || (p.title ?? '').includes(w));
    if (hit) {
      issues.push({ channel: label, rule: 'josa', detail: `조사 오류: "${hit}"`, severity: 'warn' });
    }

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
      issues.push({
        channel: label,
        rule: 'title-prefix',
        detail: `제목이 상호로 시작: "${title.slice(0, 30)}"`,
        severity: 'warn',
      });
    }

    // 6) 화자 — 사장님 계정에서 손님·이웃 말투가 나가면 바이럴 조작으로 읽혀 계정이 위험하다.
    //
    // 이 규칙은 원래 **생성 단계 자동 보정에만** 걸려 있었다(channel-native의 재작성 루프).
    // 그래서 보정이 실패했거나 그 경로를 타지 않은 글은 이 최종 방어선을 그냥 통과했다.
    // 생성이 고치는 것과 점검이 막는 것은 별개다 — 같은 함수를 여기서도 본다.
    // 규칙은 좁게 잡혀 있고 운영 203건에서 2건 적중·오탐 0으로 확인됐다.
    const voice = notOwnerVoice(body, storeName);
    if (voice) {
      issues.push({
        channel: label,
        rule: 'owner-voice',
        detail: `사장님 말투가 아님: "${voice}"`,
        severity: 'critical',
      });
    }

    // 7) 시점 — 지금과 정반대 계절을 가리키는 말.
    //    8월에 "동절기 영업 안내"가 그대로 나갔다(2026-08-13). seasonalContext는
    //    생성 프롬프트에만 들어가 있어서, 모델이 그 힌트를 무시하면 아무도 못 잡았다.
    if (staleRe) {
      const claim = staleSeasonClaim(body, staleRe) ?? staleSeasonClaim(title, staleRe);
      if (claim) {
        issues.push({
          channel: label,
          rule: 'stale-season',
          detail: `지금 ${season}인데 "${claim.slice(0, 40)}"`,
          severity: 'critical',
        });
      }
    }
  }

  // 8) 세트 검수 — 여기서부터는 글 하나가 아니라 **오늘 세트 전체**를 본다.
  //    한 장씩 크게 보면 다 괜찮아 보이고, 붙여놓아야 같은 얼굴인 게 보인다.
  for (const d of findDuplicates(
    posts.map((p) => ({ label: labelOf(p.channel), text: (p.bodyPlain ?? '').trim() })),
  )) {
    issues.push({
      channel: `${d.a} ↔ ${d.b}`,
      rule: 'duplicate',
      detail:
        d.ratio >= 1
          ? '두 채널 본문이 통째로 같음'
          : `본문이 ${Math.round(d.ratio * 100)}% 겹침: "${d.sample.slice(0, 24)}…"`,
      severity: 'critical',
    });
  }

  return issues;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
