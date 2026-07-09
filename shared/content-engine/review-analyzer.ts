/**
 * 리뷰 감정 분석 + 사장님 답글 초안 생성.
 *
 * 설계 원칙:
 * - 룰베이스가 기본(무료·즉시·오프라인). Gemini는 rate-limit 있으므로 "강화"로만.
 * - 답글은 어디까지나 초안 → 사장님이 확인 후 발행(assisted). 절대 자동 게시 아님.
 * - 부정 리뷰는 사과+개선의지+재방문 유도, 긍정은 진심 감사+디테일 언급.
 */

export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface ReviewLike {
  externalId: string;
  author: string;
  content: string;
  keywords?: string[];
}

export interface AnalyzedReview {
  sentiment: Sentiment;
  /** -1(매우 부정) ~ +1(매우 긍정) */
  score: number;
  replyDraft: string;
  /** 룰베이스가 잡은 근거 (디버그·투명성) */
  signals: { positive: string[]; negative: string[] };
}

// 강한 부정(가중 2) — 실질적 클레임
const STRONG_NEG = [
  '최악', '다신', '다시는', '환불', '머리카락', '벌레', '이물질', '식중독', '불친절',
  '위생', '더럽', '불쾌', '역겨', '실망', '별로예요', '별로에요', '엉망', '최악이',
];
// 일반 부정(가중 1)
const NEG = [
  '미지근', '식었', '차갑게 식', '비싸', '비쌈', '가격이 부담', '웨이팅', '오래 기다',
  '기다렸', '느끼', '짜요', '짰', '싱거', '눅눅', '딱딱', '질겨', '냄새', '아쉬웠',
  '아쉽', '별로', '그저 그', '그닥', '불편', '좁', '시끄', '주차가 힘', '불량', '항의',
];
// 강한 긍정(가중 2)
const STRONG_POS = [
  '최고', '너무 맛있', '정말 맛있', '진짜 맛있', '감동', '훌륭', '또 가고', '또 방문',
  '재방문', '단골', '사랑', '완벽', '강추', '인생', '반했', '최애',
];
// 일반 긍정(가중 1)
const POS = [
  '맛있', '친절', '좋아요', '좋았', '만족', '분위기', '아늑', '정겨운', '깔끔', '청결',
  '가성비', '추천', '행복', '예뻐', '예쁘', '귀여', '진하고', '감사', '편안', '넓',
  '친절하', '맛나', '괜찮', '좋은', '잘 먹', '멋지',
];

function countHits(text: string, words: string[]): string[] {
  const hits: string[] = [];
  for (const w of words) if (text.includes(w)) hits.push(w);
  return hits;
}

export function analyzeSentiment(content: string, keywords: string[] = []): {
  sentiment: Sentiment;
  score: number;
  signals: { positive: string[]; negative: string[] };
} {
  const text = `${content} ${keywords.join(' ')}`;

  const sNeg = countHits(text, STRONG_NEG);
  const nNeg = countHits(text, NEG);
  const sPos = countHits(text, STRONG_POS);
  const nPos = countHits(text, POS);

  const negScore = sNeg.length * 2 + nNeg.length;
  const posScore = sPos.length * 2 + nPos.length;
  // 키워드 태그는 대부분 긍정(네이버가 긍정 키워드 위주 제공) → 약한 가중
  const kwPos = keywords.filter((k) => /맛있|친절|청결|좋|깔끔/.test(k)).length * 0.5;

  const rawTotal = posScore + kwPos - negScore;
  const magnitude = posScore + kwPos + negScore || 1;
  const score = Math.max(-1, Math.min(1, rawTotal / magnitude));

  let sentiment: Sentiment;
  // 강한 부정 신호가 하나라도 있으면 우선 부정으로 (사장님이 놓치면 안 되는 리뷰)
  if (sNeg.length > 0 || (negScore > 0 && negScore >= posScore)) sentiment = 'negative';
  else if (posScore > negScore) sentiment = 'positive';
  else sentiment = 'neutral';

  return {
    sentiment,
    score: Number(score.toFixed(2)),
    signals: { positive: [...sPos, ...nPos], negative: [...sNeg, ...nNeg] },
  };
}

interface ReplyContext {
  storeName: string;
  author: string;
  content: string;
  keywords: string[];
  ownerNickname?: string; // 예: "쿵더쿵 사장" (없으면 상호 사용)
}

/** 결정적 선택 — 같은 리뷰엔 항상 같은 템플릿(재실행 시 답글 안 바뀜) */
function pick<T>(arr: T[], seed: string): T {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
  return arr[h % arr.length];
}

/** 본문에서 언급할 만한 짧은 조각(첫 명사구 근처) 추출 — 답글 개인화용 */
function firstDetail(content: string): string {
  const clean = content.replace(/[^가-힣a-zA-Z0-9 ~!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const sentence = clean.split(/[.!~]/)[0]?.trim() ?? '';
  return sentence.length > 4 && sentence.length <= 24 ? sentence : '';
}

export function draftReply(ctx: ReplyContext, sentiment: Sentiment): string {
  const who = ctx.author && ctx.author !== '익명' ? `${ctx.author}님` : '고객님';
  const store = ctx.storeName;
  const kw = ctx.keywords[0];
  const detail = firstDetail(ctx.content);
  const seed = ctx.author + ctx.content.slice(0, 20);

  if (sentiment === 'negative') {
    const openers = [
      `${who}, 소중한 시간 내어 방문해 주셨는데 아쉬운 경험을 드려 진심으로 죄송합니다.`,
      `${who}, 먼저 불편을 드린 점 깊이 사과드립니다.`,
      `${who}, 기대에 미치지 못해 정말 죄송한 마음입니다.`,
    ];
    const bodies = [
      `말씀 주신 부분 팀과 함께 바로 점검하고 개선하겠습니다.`,
      `다시 이런 일이 없도록 하나하나 다잡겠습니다.`,
      `주신 피드백 허투루 넘기지 않고 반드시 나아지겠습니다.`,
    ];
    const closers = [
      `다음에 다시 기회를 주신다면 더 좋은 모습으로 보답하겠습니다. — ${store} 드림`,
      `기회를 주시면 달라진 ${store}로 꼭 보여드리겠습니다.`,
      `언제든 다시 찾아주시면 정성껏 모시겠습니다. — ${store}`,
    ];
    return `${pick(openers, seed)} ${pick(bodies, seed + 'b')} ${pick(closers, seed + 'c')}`;
  }

  if (sentiment === 'positive') {
    const focus = detail ? `"${detail}"라고 해주신 말씀` : kw ? `${kw}라고 느껴주신 마음` : '따뜻한 후기';
    const openers = [
      `${who}, ${focus} 정말 감사합니다.`,
      `${who}, ${focus}에 저희가 더 힘이 났어요.`,
      `${who}, ${focus} 남겨주셔서 하루가 환해졌습니다.`,
    ];
    const closers = [
      `다음에 오실 때도 변함없는 정성으로 모시겠습니다. 또 뵈어요. — ${store}`,
      `기억해 주신 만큼 늘 한결같겠습니다. 또 들러주세요. — ${store}`,
      `${store}는 늘 이 자리에서 기다리고 있겠습니다. 감사합니다.`,
    ];
    return `${pick(openers, seed)} ${pick(closers, seed + 'c')}`;
  }

  // neutral
  const openers = [
    `${who}, 방문해 주시고 후기까지 남겨주셔서 감사합니다.`,
    `${who}, 시간 내어 들러주셔서 고맙습니다.`,
  ];
  const closers = [
    `다음엔 더 만족스러운 경험 드리도록 준비하겠습니다. — ${store}`,
    `더 좋은 모습으로 다시 인사드릴게요. 감사합니다! — ${store}`,
  ];
  return `${pick(openers, seed)} ${pick(closers, seed + 'c')}`;
}

export function analyzeReview(
  review: ReviewLike,
  storeName: string,
): AnalyzedReview {
  const { sentiment, score, signals } = analyzeSentiment(review.content, review.keywords ?? []);
  const replyDraft = draftReply(
    {
      storeName,
      author: review.author,
      content: review.content,
      keywords: review.keywords ?? [],
    },
    sentiment,
  );
  return { sentiment, score, replyDraft, signals };
}
