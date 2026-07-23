import type { TargetLength } from './angles';

/**
 * 분량 지시 — "목표 길이: medium (1800자)" 같은 약한 문구는 flash가 무시하고
 * 목표의 52~64%만 쓴다(실측: medium 1800 목표에 ~1000자). 네이버 상위노출은
 * 글자수·구조가 핵심 변수라, 최소 글자수·소제목 수·문단 밀도를 명령형으로 강제한다.
 */
export interface LengthSpec {
  target: TargetLength;
  minChars: number; // 공백 제외 최소 글자수
  h2: string; // 소제목 개수 범위
}

const SPECS: Record<TargetLength, LengthSpec> = {
  short: { target: 'short', minChars: 700, h2: '2~3' },
  medium: { target: 'medium', minChars: 1600, h2: '4~5' },
  long: { target: 'long', minChars: 2200, h2: '5~7' },
};

export function lengthSpec(target: TargetLength = 'medium'): LengthSpec {
  return SPECS[target];
}

/** writingTemplate의 길이 조건 문구 — 4개 프리셋이 공유(단일 원천) */
export function lengthDirective(target: TargetLength = 'medium'): string {
  const s = SPECS[target];
  return (
    `분량(반드시 지킬 것): 본문은 공백 제외 **최소 ${s.minChars.toLocaleString()}자 이상**. ` +
    `소제목(<h2>) ${s.h2}개, 각 소제목 아래 2~3문단, 각 문단 3~5문장으로 충분히 전개. ` +
    `짧게 끝내지 말고 각 소재를 감각·경험 디테일로 깊이 있게 풀 것(맥락 없는 문장 늘리기·같은 말 반복은 금지).`
  );
}
