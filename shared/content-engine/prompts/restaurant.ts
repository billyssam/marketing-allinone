import type { IndustryPrompt } from '../types';
import { lengthDirective } from '../length';

export const restaurantPrompt: IndustryPrompt = {
  systemPrompt: `[음식점 전용 룰]
- 톤: 식욕 자극 + 신선함·정성. "먹고 싶다"는 감각을 문장으로 만들어야 함.
- 감각어: 향(육즙·불향·향신료), 온도(뜨끈·시원), 질감(쫄깃·바삭·부드러움), 색(윤기·색감)
- 재료의 산지/원산지를 자연스럽게 언급 (신뢰).
- 조리법을 짧게 설명하되 요리 강의처럼은 X.
- 가격은 언급하되 "가격 대비 만족" 뉘앙스.
- 필수 요소: 대표 메뉴 1개 상세, 곁들이는 메뉴 1개, 매장 분위기, 방문 팁 (예약·주차·대기 등)
- 금기: "1등 맛집", "인생 맛집" 등 자극적 자극형 카피, 가격만 부각.`,

  planningTemplate: (input) => `# 기획 단계

## 매장 정보
- 상호: ${input.store.name}
- 위치: ${input.store.address ?? '(미확인)'}
- 브랜드 톤: ${JSON.stringify(input.store.brandTone)}
- 플레이스 요약: ${input.place?.descriptionRaw ?? '(정보 없음)'}
- 메뉴: ${input.place?.menu?.slice(0, 8).map((m) => m.name).join(', ') ?? '(정보 없음)'}

## 사진 (${input.photos.length}장)
${input.photos.map((p, i) => `- 사진 ${i}: ${p.userNote ?? '(메모 없음)'} / ${p.exif?.takenAt ?? '(시간 미상)'}`).join('\n')}

## 방향
${input.angle ?? '(자유)'}

## 결정할 것
1. **훅**: 어떤 요리·순간이 훅이 되는가
2. **핵심 메시지**: 이 집의 차별점 1가지
3. **문단 구성 3~5개**
4. **CTA**: 방문·예약 자연 유도

JSON:
{"hook": "...", "keyMessage": "...", "outline": [...], "cta": "..."}`,

  writingTemplate: (planning, input) => `# 본문 작성

## 기획
${planning}

## 조건
- ${lengthDirective(input.targetLength)}
- 사진 ${input.photos.length}장 <img data-photo-index="N">로 삽입
- 대표 메뉴 문단은 감각어 2개 이상
- 마지막 문단에 실용 정보 (주소·영업시간·예약 여부)
- 태그 5~10개 (상호·업종·지역·대표메뉴·특징)

## 제목 (출력 JSON의 title)
${input.titleRule ?? '검색 유입을 고려하되 매번 다른 구조로.'}

## 출력
BASE JSON 스키마.`,
};
