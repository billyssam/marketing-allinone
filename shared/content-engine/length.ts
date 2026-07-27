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
  perSection: number; // 소제목 하나당 최소 글자수(전체 하한을 구조로 뒷받침)
}

/**
 * 실측 기반 목표(2026-07-27 조정):
 *  - 네이버 SEO 최적 구간은 1,800~2,000자(리서치) — 그 이상은 노출 이득 없이 늘어짐만.
 *  - 모델 실측: medium(최소1600 지시) → 1619·2001자 안정 / long(최소2200 지시) → 1829·1290자.
 *    ⚠️ 과도한 목표가 오히려 결과를 떨어뜨림(long이 medium보다 짧게 나옴).
 *  → long을 SEO 최적 상단(1900)으로 현실화하고, 편차는 "섹션당 최소 글자수"로 잡는다.
 */
const SPECS: Record<TargetLength, LengthSpec> = {
  short: { target: 'short', minChars: 700, h2: '2~3', perSection: 250 },
  medium: { target: 'medium', minChars: 1600, h2: '4~5', perSection: 350 },
  long: { target: 'long', minChars: 1900, h2: '5~6', perSection: 350 },
};

export function lengthSpec(target: TargetLength = 'medium'): LengthSpec {
  return SPECS[target];
}

/** writingTemplate의 길이 조건 문구 — 4개 프리셋이 공유(단일 원천) */
export function lengthDirective(target: TargetLength = 'medium'): string {
  const s = SPECS[target];
  return (
    `분량(반드시 지킬 것): 본문은 공백 제외 **최소 ${s.minChars.toLocaleString()}자 이상**. ` +
    `소제목(<h2>) ${s.h2}개를 두고, **소제목마다 최소 ${s.perSection}자**(2~3문단, 각 문단 3~5문장)를 채울 것. ` +
    `마지막 소제목까지 같은 밀도를 유지하고(뒤로 갈수록 짧아지지 않게), ` +
    `각 소재를 감각·경험 디테일로 깊이 있게 풀 것(맥락 없는 문장 늘리기·같은 말 반복은 금지).`
  );
}
