/**
 * 리뷰 감정 분석 + 사장님 답글 초안 생성.
 *
 * 설계 원칙:
 * - 룰베이스가 기본(무료·즉시·오프라인). Gemini는 rate-limit 있으므로 "강화"로만.
 * - 답글은 어디까지나 초안 → 사장님이 확인 후 발행(assisted). 절대 자동 게시 아님.
 * - 부정 리뷰는 사과+개선의지+재방문 유도, 긍정은 진심 감사+디테일 언급.
 */
import { withJosa } from '../korean';

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
  '최악', '다신', '다시는', '환불', '벌레', '이물질', '식중독', '불친절',
  '더럽', '불쾌', '역겨', '실망', '별로예요', '별로에요', '엉망', '최악이',
  // ⚠️ '머리카락'·'위생'을 단독으로 두면 안 된다(실측으로 확인).
  //    음식점 클레임("머리카락 나왔어요")을 잡으려던 말인데, 미용실에선 '머리카락'이
  //    당연한 단어고 네일·병원에선 "위생 철저해요"가 칭찬이다.
  //    실제로 "머리카락이 상했는데 살려주셔서 감사해요"·"위생 철저하고 소독도 매번"이
  //    전부 negative로 뒤집혔다 → 사장님은 칭찬에 부정 알림을 받고,
  //    기뻐한 손님은 "아쉬운 경험을 드려 죄송합니다" 답글을 받게 된다.
  //    → 불만이 확정되는 형태로만 좁힌다.
  '머리카락이 나', '머리카락 나왔', '머리카락이 들어',
  '비위생', '위생이 안', '위생 안', '위생 엉망',
];
// 일반 부정(가중 1)
const NEG = [
  '미지근', '식었', '차갑게 식', '비싸', '비쌈', '가격이 부담', '웨이팅', '오래 기다',
  '기다렸', '느끼', '짜요', '짰', '싱거', '눅눅', '딱딱', '질겨', '냄새', '아쉬웠',
  '아쉽', '별로', '그저 그', '그닥', '불편', '좁', '시끄', '주차가 힘', '불량', '항의',
  // 정중한 불만 — 한국 리뷰에서 매우 흔한데 사전에 아예 없었다.
  // 긍정어 보강("효과 좋"류)이 "효과 좋지 않아요"를 긍정으로 오판하지 않도록 하는 균형추이기도 하다.
  '좋지 않', '아쉬었', '아쉬워', '별로였', '비추', '기대 이하', '두 번은',
];
// 강한 긍정(가중 2)
const STRONG_POS = [
  '최고', '너무 맛있', '정말 맛있', '진짜 맛있', '감동', '훌륭', '또 가고', '또 방문',
  '재방문', '단골', '사랑', '완벽', '강추', '인생', '반했', '최애',
  // 업종 무관 강조형 — 음식 표현이 없는 업종에서 "너무 좋아요"가 최상위 칭찬이다
  '너무 좋', '정말 좋', '진짜 좋', '또 올', '또 받', '믿고',
];
// 일반 긍정(가중 1)
const POS = [
  '맛있', '친절', '좋아요', '좋았', '만족', '분위기', '아늑', '정겨운', '깔끔', '청결',
  '가성비', '추천', '행복', '예뻐', '예쁘', '귀여', '진하고', '감사', '편안', '넓',
  '친절하', '맛나', '괜찮', '좋은', '잘 먹', '멋지',
  // ── 비음식 업종 보강 (실측 기반) ──
  // 사전이 음식에 치우쳐 있어 시술·의료·운동 리뷰가 중립으로 샜다.
  // 중립이 되면 명백히 기뻐하는 사장님 고객에게 밋밋한 중립 답글이 나가고
  // 대시보드 긍정률도 실제보다 낮게 잡힌다. (정형외과 10건 중 3건이 중립이었음)
  // ⚠️ '효과'·'실력'처럼 단독으로는 부정문("효과 없어요")에도 걸리는 말은
  //    확정 긍정형으로만 넣는다 — 불만 리뷰를 긍정으로 오판하는 게 훨씬 나쁘다.
  '효과 좋', '효과가 좋', '효과적', '실력 좋', '실력이 좋',
  '잘 받', '잘 봐주', '잘해주', '잘 해주', '꼼꼼', '섬세', '자세히 설명', '설명 잘',
  '나아졌', '호전', '통증이 줄', '과잉진료 없', '과잉 진료 없', '시원하게',
  '빠르시', '신속', '쾌적', '전문적', '세심', '철저', '안심', '소독',
  '이쁘', '예뽀', '예뿌', '찐해', '찐하', // 구어체 변형(뷰티·카페에서 매우 흔함)
];

function countHits(text: string, words: string[]): string[] {
  // 리뷰는 띄어쓰기를 잘 지키지 않는다("잘받고", "과잉진료없이", "효과좋야요").
  // 사전에 변형을 계속 추가하는 대신 공백을 지운 형태끼리도 비교한다.
  //
  // ⚠️ 단, **원래 띄어쓰기가 있는 항목에만** 적용한다. 전체에 적용했더니
  //    "해주십니다신장분사기"에서 '다신'(강한부정)이 단어 경계를 넘어 걸려
  //    칭찬 리뷰가 부정으로 뒤집혔다(실측). 붙여쓴 짧은 말은 경계를 넘기 쉽다.
  const squeezed = text.replace(/\s+/g, '');
  const hits: string[] = [];
  for (const w of words) {
    if (text.includes(w)) {
      hits.push(w);
    } else if (/\s/.test(w) && squeezed.includes(w.replace(/\s+/g, ''))) {
      hits.push(w);
    }
  }
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
  // 네이버 키워드 태그도 업종별로 다르다 — "전문적이에요"·"효과가 좋아요"·"시설이 쾌적해요"
  const kwPos = keywords.filter((k) => /맛있|친절|청결|좋|깔끔|전문|효과|꼼꼼|편안|쾌적|세심/.test(k)).length * 0.5;

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
      `${withJosa(store, '은는')} 늘 이 자리에서 기다리고 있겠습니다. 감사합니다.`,
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
