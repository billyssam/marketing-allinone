/** 소식 정책(2026-05-04 시행). 초안 생성 수는 당근 실제 게시 수가 아니다. */
export const DAANGN_PUBLICATION = {
  entryUrl: 'https://business.daangn.com/',
  policyUrl: 'https://business.daangn.com/notice/detail/303',
  paymentPolicyUrl: 'https://business.daangn.com/notice/detail/436',
  paymentPolicy: '2026년 12월 12일부터 선입금 후 배송·배달하는 식품 판매 등 당근이 개별 통지한 비즈프로필은 채팅으로 받은 선결제 주문에 채팅주문 결제를 사용해야 해요. 대상이라면 소식에서도 계좌번호·계좌이체·외부 결제를 유도하지 않도록 확인해주세요.',
  limit: '당근 소식은 하루 최대 5개까지 작성할 수 있어요.',
  limitHelp: '당근에서 오늘 작성한 소식 수를 확인해주세요. 한도를 채웠다면 초안을 보관하고 다음 날 게시하세요.',
  steps: [
    '당근비즈니스에서 시작하기 → 로그인 → 게시할 비즈프로필을 선택하세요.',
    '비즈프로필의 소식 작성에서 복사한 내용을 붙여넣고 사진과 가게 정보를 확인하세요.',
    '당근에서 게시를 마친 뒤 게시물이 보이는지 확인하고, 이 탭으로 돌아와 게시 확인을 저장하세요.',
  ],
} as const;

export function daangnPublicationText(draft: { title?: string | null; bodyPlain?: string | null }): string {
  return [draft.title?.trim(), draft.bodyPlain?.trim()].filter(Boolean).join('\n\n');
}
