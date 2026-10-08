/** 운영 장애의 원문·키·공급자 설정을 고객의 할 일로 넘기지 않는다. */
export function generationFailure(error: unknown): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  if (/429|quota|rate.?limit|resource.?exhausted/i.test(raw)) {
    return { status: 429, message: '지금 초안 생성 요청이 많아 잠시 쉬고 있어요. 저장된 초안은 계속 사용할 수 있어요. 잠시 후 다시 시도해주세요.' };
  }
  if (/api.?key|not configured|설정|503|401|403/i.test(raw)) {
    return { status: 503, message: '초안 생성 연결을 확인하고 있어요. 매장 정보는 저장되어 있으니 다시 입력하지 않으셔도 됩니다.' };
  }
  return { status: 500, message: '초안을 만들지 못했어요. 매장 정보는 저장되어 있으니 잠시 후 다시 시도해주세요.' };
}
