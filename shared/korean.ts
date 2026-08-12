/**
 * 한국어 조사 처리 — 상호·이름이 무엇이든 조사가 맞게 붙도록.
 *
 * 왜 필요한가(실측): 답글 초안에 "쿵더쿵는 늘 이 자리에서…"가 나갔다.
 * 받침 있는 상호에 '는'을 붙인 것. 사장님 상호는 매장마다 다르고 절반은 받침이 있으니
 * 고정 조사를 쓰면 **손님에게 나가는 글의 절반이 틀린다.** 티가 확 나는 종류의 오류다.
 */

type JosaPair = '은는' | '이가' | '을를' | '과와' | '이에요예요' | '으로로' | '아야' | '이라라';

const PAIRS: Record<JosaPair, [withBatchim: string, withoutBatchim: string]> = {
  은는: ['은', '는'],
  이가: ['이', '가'],
  을를: ['을', '를'],
  과와: ['과', '와'],
  이에요예요: ['이에요', '예요'],
  으로로: ['으로', '로'],
  아야: ['아', '야'],
  // 절기·이벤트 이름에 붙는다("곧 크리스마스라", "곧 어린이날이라")
  이라라: ['이라', '라'],
};

/**
 * 마지막 글자에 받침이 있는가.
 * 한글이 아니면(영문·숫자로 끝나는 상호) 받침 없음으로 본다 — 발음 기준 판정은
 * 오히려 더 틀리기 쉬워서, 자연스러운 쪽(는·가)으로 떨어뜨린다.
 */
export function hasBatchim(word: string): boolean {
  const last = (word ?? '').trim().slice(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

/** 'ㄹ' 받침은 '으로'가 아니라 '로'를 쓴다(서울로, 대칭적으로 예외) */
function isRieul(word: string): boolean {
  const last = (word ?? '').trim().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 === 8;
}

/** 단어에 맞는 조사만 돌려준다 */
export function josa(word: string, pair: JosaPair): string {
  const [withB, withoutB] = PAIRS[pair];
  if (pair === '으로로') return hasBatchim(word) && !isRieul(word) ? withB : withoutB;
  return hasBatchim(word) ? withB : withoutB;
}

/** 단어 + 조사를 한 번에 (`withJosa('쿵더쿵','은는')` → '쿵더쿵은') */
export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`;
}
