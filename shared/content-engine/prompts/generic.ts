import type { IndustryPrompt, DraftInput } from '../types';

/**
 * offering 기반 범용 프리셋 — 카페/음식점/동물병원 외 모든 업종을 커버.
 *   product = 상품 판매(소매·온라인셀러): 상품 특징·혜택·후기·구매 유도
 *   service = 서비스 제공(미용·수리·전문): 전문성·비포애프터·후기·신뢰
 *   booking = 예약 기반(병원·헬스·클래스·숙박): 성과·신뢰·예약 유도
 * 새 업종이 들어와도 taxonomy.preset이 이 셋 중 하나로 매핑돼 크래시 없이 생성된다.
 */

const commonPlanning = (input: DraftInput, focusQuestions: string) => `# 기획 단계

## 사업 정보
- 상호: ${input.store.name}
- 위치: ${input.store.address ?? '(미확인)'}
- 브랜드 톤: ${JSON.stringify(input.store.brandTone)}
- 플레이스/소개 요약: ${input.place?.descriptionRaw ?? '(정보 없음)'}
- 대표 항목: ${input.place?.menu?.slice(0, 5).map((m) => m.name).join(', ') ?? '(정보 없음)'}

## 이번 포스트에 쓸 사진 (${input.photos.length}장)
${input.photos.map((p, i) => `- 사진 ${i}: ${p.userNote ?? '(메모 없음)'}`).join('\n')}

## 방향 (있으면)
${input.angle ?? '(자유)'}

## 지금 결정할 것
${focusQuestions}

간결하게 JSON으로 답변:
{ "hook": "...", "keyMessage": "...", "outline": ["문단1 주제", "문단2 주제"], "cta": "..." }`;

const commonWriting = (planning: string, input: DraftInput, tail: string) => `# 본문 작성

위 기획을 바탕으로 실제 블로그 본문을 작성한다.

## 기획
${planning}

## 조건
- 목표 길이: ${input.targetLength ?? 'medium'} (short=800자, medium=1800자, long=2400자)
- 사진 ${input.photos.length}장을 <img data-photo-index="N"> 태그로 문단 사이 삽입
- 문단은 <p>, 소제목은 <h2>
- ${tail}
- 태그는 상호명·업종·지역·핵심키워드 조합으로 5~10개

## 출력
BASE 시스템 프롬프트의 JSON 스키마 그대로.`;

export const productPrompt: IndustryPrompt = {
  systemPrompt: `[상품 판매업 전용 룰]
- 톤: 이 상품이 왜 좋은지 구체적으로. 과장 광고가 아니라 신뢰 가는 소개.
- 필수: 상품 특징·차별점 1개, 실제 사용/활용 장면 1개, 누구에게 좋은지(타겟) 1개, 구매·문의로 잇는 자연스러운 CTA 1개.
- 가격은 실제 값이 있으면 명시, 없으면 언급하지 않음(지어내기 금지).
- 온라인 구매가 가능하면 "스토어에서 만나보세요" 식으로 구매 동선 안내.
- 금기: "완판 임박", "역대급" 같은 자극적 상술. 담백한 신뢰가 목표.`,
  planningTemplate: (input) =>
    commonPlanning(
      input,
      `1. **훅**: 이 상품의 어떤 매력·문제해결을 첫 3줄에 담을까?
2. **핵심 메시지**: 고객이 이 상품으로 얻는 것
3. **문단 구성 3~5개**: 특징 → 사용장면 → 추천대상
4. **CTA**: 구매·문의를 어떻게 자연스럽게 유도할까`,
    ),
  writingTemplate: (planning, input) =>
    commonWriting(planning, input, '마지막 문단에 구매·문의 방법(스토어/연락처가 있으면)'),
};

export const servicePrompt: IndustryPrompt = {
  systemPrompt: `[서비스업 전용 룰]
- 톤: 전문성과 진정성. 이 사장님/전문가에게 맡기면 왜 안심인지.
- 필수: 서비스 강점·전문성 1개, 실제 결과/사례(비포애프터·후기 톤) 1개, 어떤 고민을 해결하는지 1개, 상담·예약으로 잇는 CTA 1개.
- 구체적 근거(경력·자격·과정)를 자연스럽게 녹여 신뢰를 쌓는다.
- 가격은 실제 값이 있으면만 명시. 무형 서비스는 "상담" 동선으로 유도.
- 금기: 근거 없는 "최고", "1등". 검증 가능한 사실과 후기로 말한다.`,
  planningTemplate: (input) =>
    commonPlanning(
      input,
      `1. **훅**: 고객의 어떤 고민·니즈를 첫 3줄에 짚을까?
2. **핵심 메시지**: 이 서비스가 해결하는 문제와 결과
3. **문단 구성 3~5개**: 고민 → 우리의 해결/전문성 → 결과·후기
4. **CTA**: 상담·예약을 어떻게 부담 없이 유도할까`,
    ),
  writingTemplate: (planning, input) =>
    commonWriting(planning, input, '마지막 문단에 상담·예약 방법(위치·연락처가 있으면)'),
};

export const bookingPrompt: IndustryPrompt = {
  systemPrompt: `[예약 기반 업종 전용 룰]
- 톤: 신뢰와 기대감. 방문·예약하면 어떤 경험·성과가 기다리는지.
- 필수: 시설/프로그램 특징 1개, 실제 성과·변화·후기 1개, 첫 방문자를 위한 안내 1개, 예약으로 잇는 CTA 1개.
- 전문성(자격·경력·시설)을 근거로 안심을 준다.
- 첫 방문 장벽을 낮추는 정보(위치·예약법·첫날 안내)를 명확히.
- 금기: 과장된 효과 보장. 현실적 기대와 실제 후기로 신뢰를 만든다.`,
  planningTemplate: (input) =>
    commonPlanning(
      input,
      `1. **훅**: 방문·예약하고 싶게 만드는 순간·성과를 첫 3줄에
2. **핵심 메시지**: 여기서 얻는 경험·변화
3. **문단 구성 3~5개**: 특징 → 성과·후기 → 첫 방문 안내
4. **CTA**: 예약·방문을 어떻게 유도할까`,
    ),
  writingTemplate: (planning, input) =>
    commonWriting(planning, input, '마지막 문단에 예약·방문 방법(위치·영업시간·연락처가 있으면)'),
};
