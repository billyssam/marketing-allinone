import type { IndustryPrompt } from '../types';
import { lengthDirective } from '../length';

export const cafePrompt: IndustryPrompt = {
  systemPrompt: `[카페·베이커리 전용 룰]
- 톤: 따뜻하고 감성적. 손님이 매장에서 느낄 분위기를 문장으로 재현.
- 감각어 사용: 향(원두·버터), 온도(따끈함·시원함), 질감(바삭·촉촉), 소리(원두 그라인딩·플레이팅)
- 계절·시간대 언급을 통해 방문 상상 유도 (아침 커피, 오후 디저트 타임 등)
- 가격은 언급하되 강조하지 않음. "합리적", "부담 없는" 정도.
- 위치·주차·좌석수 등 실용 정보는 마지막 문단에 배치.
- 필수 포함 요소: 원두/음료 특징 1개, 대표 디저트 1개, 매장 분위기 묘사 1개, 방문 후 이용 팁 1개.
- 금기: "인생 카페", "미쳤다" 같은 자극적 표현. 자연스러운 감성이 목표.`,

  planningTemplate: (input) => `# 기획 단계

## 매장 정보
- 상호: ${input.store.name}
- 위치: ${input.store.address ?? '(미확인)'}
- 브랜드 톤: ${JSON.stringify(input.store.brandTone)}
- 플레이스 요약: ${input.place?.descriptionRaw ?? '(정보 없음)'}
- 대표 메뉴: ${input.place?.menu?.slice(0, 5).map((m) => m.name).join(', ') ?? '(정보 없음)'}

## 이번 포스트에 쓸 사진 (${input.photos.length}장)
${input.photos.map((p, i) => `- 사진 ${i}: ${p.userNote ?? '(메모 없음)'} / 촬영: ${p.exif?.takenAt ?? '(시간 미상)'}`).join('\n')}

## 방향 (있으면)
${input.angle ?? '(자유)'}

## 지금 결정할 것
1. 이번 포스트의 **훅** (첫 3줄): 어떤 감각·순간을 잡아낼 것인가?
2. **핵심 메시지 1개**: 손님이 방문했을 때 얻는 경험
3. **문단 구성 3~5개**: 사진 배치와 함께
4. **자연스러운 CTA**: 방문·예약을 어떻게 유도할 것인가

간결하게 JSON으로 답변:
{
  "hook": "...",
  "keyMessage": "...",
  "outline": ["문단1 주제", "문단2 주제", ...],
  "cta": "..."
}`,

  writingTemplate: (planning, input) => `# 본문 작성

위 기획을 바탕으로 실제 블로그 본문을 작성한다.

## 기획
${planning}

## 조건
- ${lengthDirective(input.targetLength)}
- 사진 ${input.photos.length}장을 <img data-photo-index="N"> 태그로 문단 사이 삽입
- 문단은 <p>, 소제목은 <h2>
- 마지막 문단에 매장 이용 정보 (주소·영업시간)
- 태그는 상호명·업종·지역·메뉴 조합으로 5~10개

## 제목 (출력 JSON의 title)
${input.titleRule ?? '검색 유입을 고려하되 매번 다른 구조로.'}

## 출력
BASE 시스템 프롬프트의 JSON 스키마 그대로.`,
};
