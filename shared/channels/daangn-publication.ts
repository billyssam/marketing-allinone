/** 소식 정책(2026-05-04 시행). 초안 생성 수는 당근 실제 게시 수가 아니다. */
export const DAANGN_PUBLICATION = {
  entryUrl: 'https://business.daangn.com/',
  policyUrl: 'https://business.daangn.com/notice/detail/303',
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
