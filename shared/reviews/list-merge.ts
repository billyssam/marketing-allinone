/**
 * 리뷰 목록 합치기 — **약속한 것이 자르기에 밀리지 않게.**
 *
 * 배경(2026-09-08 가짜 리뷰 120건 주입으로 실측):
 * `/reviews`는 최근 100건만 가져와 렌더 비용을 막고, 화면에서 "부정 → 답글대기 → 최신"으로
 * 다시 정렬한다. 그런데 **자르기가 정렬보다 먼저** 일어나므로, 미답이 100건을 넘으면
 * 오래된 부정 미답이 아예 안 실려 온다 — "부정 리뷰가 맨 위로 올라와 놓치지 않아요"가 거짓이 된다.
 * (실측: 부정 40건 중 20건만 실려 왔고, 가장 오래된 부정은 화면에 없었다)
 *
 * ⚠️ 처음엔 `.order('sentiment', { ascending: true })` 한 줄로 해결하려 했는데 **틀렸다.**
 * `sentiment`는 텍스트가 아니라 **enum**이고, 선언 순서가 `positive, neutral, negative`라
 * 오름차순이 곧 "긍정 먼저"였다. 스키마 선언 순서에 기대는 정렬은 값이 하나 추가되는 순간
 * 조용히 뒤집힌다 → **꼭 보여야 하는 것은 따로 가져와서 합친다.**
 */

export interface MergeInput<T> {
  /** 반드시 보여야 하는 것 — 부정 미답. 자르기에 절대 밀리면 안 된다 */
  mustShow: T[];
  /** 일반 목록(미답 먼저·최신순) */
  general: T[];
  /** 방금 완료 체크한 것 — 목록 밖으로 밀리면 '완료 취소'를 못 누른다 */
  recentDone: T[];
}

/**
 * 세 목록을 **우선순위대로** 합치고 중복을 없앤다.
 * 순서는 화면 정렬이 다시 잡으므로, 여기서는 **무엇이 실려 가는가**만 보장한다.
 */
export function mergeReviewLists<T extends { id: string }>(
  input: MergeInput<T>,
  limit: number,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  // mustShow가 먼저 — limit이 모자라도 부정 미답은 살아남아야 한다
  for (const group of [input.mustShow, input.recentDone, input.general]) {
    for (const r of group) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
