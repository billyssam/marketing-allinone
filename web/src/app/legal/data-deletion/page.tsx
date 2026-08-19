/**
 * 데이터 삭제 확인 페이지 — Meta 데이터 삭제 콜백이 돌려주는 URL의 목적지.
 *
 * Meta 규격상 사용자가 이 주소로 들어와 **삭제가 어떻게 처리됐는지 확인**할 수 있어야 한다.
 * 심사에서 이 페이지를 직접 열어본다.
 */
export const metadata = { title: '데이터 삭제 안내' };

export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <span className="eyebrow">데이터 삭제</span>
      <h1 className="mt-3 text-[26px] font-semibold tracking-tight">연동 정보가 삭제되었습니다</h1>

      {code && (
        <p className="mono mt-4 inline-block rounded-[var(--radius)] border border-[var(--color-hair)] bg-[var(--color-panel)] px-3 py-1.5 text-[12.5px] text-[var(--color-fg-2)]">
          확인 코드 · {code}
        </p>
      )}

      <div className="mt-8 space-y-5 text-[14px] leading-relaxed text-[var(--color-fg-2)]">
        <div>
          <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">무엇이 삭제되었나요</h2>
          <p className="mt-2">
            인스타그램 연동 정보(액세스 토큰, 계정 식별자, 채널 연결 기록)를 즉시 삭제했습니다.
            더 이상 저희 서비스가 회원님의 인스타그램에 접근하지 않습니다.
          </p>
        </div>

        <div>
          <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">남아 있는 것</h2>
          {/* 연동만 끊었는데 서비스 데이터까지 지우면 그게 더 큰 사고다 — 그 경계를 분명히 밝힌다 */}
          <p className="mt-2">
            매장 정보와 저희가 만들어 드린 글·리뷰 기록은 <b className="text-[var(--color-fg)]">저희 서비스의 데이터</b>라
            그대로 남습니다. 인스타그램에서 가져온 정보가 아니기 때문입니다.
            이것까지 모두 지우시려면 아래 방법으로 계정을 삭제해 주세요.
          </p>
        </div>

        <div>
          <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">전체 삭제(회원 탈퇴)</h2>
          <p className="mt-2">
            로그인 후 <b className="text-[var(--color-fg)]">설정 → 계정 삭제</b>에서 탈퇴하시면 매장·글·리뷰·단골
            정보가 즉시 모두 삭제됩니다. 되돌릴 수 없습니다.
          </p>
          <p className="mt-2">
            직접 진행이 어려우시면 <b className="text-[var(--color-fg)]">billysir@naver.com</b>으로 요청해 주세요.
            영업일 기준 3일 이내에 처리하고 결과를 회신드립니다.
          </p>
        </div>
      </div>

      <a href="/" className="mt-10 inline-block text-[13px] text-[var(--color-amber)]">
        홈으로 →
      </a>
    </main>
  );
}
