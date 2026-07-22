import type { IndustryPrompt } from '../types';

export const vetPrompt: IndustryPrompt = {
  systemPrompt: `[동물병원 전용 룰]
- 톤: 신뢰·전문·따뜻함. 보호자 관점에서 안심할 수 있게.
- 의료 광고 규제 준수:
  - "완치", "100% 안전" 같은 단정 표현 금지
  - "많은 반려동물이 낫습니다" 같은 통계 표현 근거 없이 X
  - 진료 효과·수술 결과의 과장 금지
- 대신 강조 가능한 것: 진료 시스템·장비·의료진 경험·상담 접근성
- 사진은 병원 시설/장비/의료진 인터뷰형 위주 (환자·수술 사진 X)
- 필수 요소: 오늘의 주제 (예: "예방접종 시기", "치과 관리"), 병원 접근성, 상담 안내
- 금기: 확정적 치료 효과 언급, 가격 광고, 다른 병원 비교/비하`,

  planningTemplate: (input) => `# 기획 단계

## 매장 정보
- 상호: ${input.store.name}
- 위치: ${input.store.address ?? '(미확인)'}
- 브랜드 톤: ${JSON.stringify(input.store.brandTone)}
- 플레이스 요약: ${input.place?.descriptionRaw ?? '(정보 없음)'}

## 사진 (${input.photos.length}장)
${input.photos.map((p, i) => `- 사진 ${i}: ${p.userNote ?? '(메모 없음)'}`).join('\n')}

## 방향
${input.angle ?? '(자유)'}

## 결정할 것
1. **주제**: 이번 글의 정보성 주제 1개 (예: 시즌별 케어)
2. **핵심 메시지**: 보호자에게 전달할 팁 1~2가지
3. **문단 구성**: 정보 → 병원 소개 → 상담 안내
4. **CTA**: 상담 문의를 자연스럽게

JSON:
{"topic": "...", "keyMessage": "...", "outline": [...], "cta": "..."}`,

  writingTemplate: (planning, input) => `# 본문 작성

## 기획
${planning}

## 조건
- 목표 길이: ${input.targetLength ?? 'medium'} (short=800자, medium=1800자, long=2400자)
- 정보성 톤: 60%, 병원 소개: 30%, CTA: 10% 비중
- 규제 표현 자체 검열 (완치·100%·최고 등 금지)
- 사진 <img data-photo-index="N">로 삽입
- 마지막 문단: 병원 위치·진료 시간·상담 접수 방법
- 태그 5~10개

## 출력
BASE JSON 스키마.`,
};
