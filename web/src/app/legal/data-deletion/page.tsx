export const metadata = { title: '데이터 삭제 안내' };

/** Public instructions. A URL or query parameter is not proof that a deletion ran. */
export default function DataDeletionPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <span className="eyebrow">데이터 삭제</span>
      <h1 className="mt-3 text-[26px] font-semibold tracking-tight">연결 정보와 계정 데이터 삭제 안내</h1>
      <div className="mt-8 space-y-5 text-[14px] leading-relaxed text-[var(--color-fg-2)]">
        <p>이 페이지는 삭제 방법을 안내합니다. 이 주소를 여는 것만으로 데이터가 삭제되거나 삭제 완료가 확인되지는 않습니다.</p>
        <section>
          <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">Facebook·Threads 연결 해제</h2>
          <p className="mt-2">로그인 후 <a href="/channels" className="text-[var(--color-amber)] underline">채널 설정</a>에서 해당 채널의 연결 해제를 선택하세요. 저장된 접근 토큰·계정 식별자·만료 정보를 제거합니다. 외부 서비스의 앱 허용 권한은 해당 서비스 설정에서도 철회할 수 있습니다.</p>
          <p className="mt-2">연결 해제 후에도 이 서비스의 매장 정보와 콘텐츠 초안은 남습니다. 다른 채널의 연결 정보 삭제가 필요하거나 직접 해제가 어려우면 아래 연락처로 요청해 주세요.</p>
        </section>
        <section>
          <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">전체 데이터 삭제</h2>
          <p className="mt-2">로그인 후 <a href="/settings" className="text-[var(--color-amber)] underline">설정 → 계정 삭제</a>에서 탈퇴하면 계정과 매장·콘텐츠·리뷰·단골 정보가 삭제됩니다. 되돌릴 수 없습니다.</p>
        </section>
        <section>
          <h2 className="text-[15px] font-semibold text-[var(--color-fg)]">삭제 요청과 처리 확인</h2>
          <p className="mt-2">직접 진행이 어려우면 <a href="mailto:billy5285@gmail.com" className="text-[var(--color-amber)] underline">billy5285@gmail.com</a>으로 요청해 주세요. 가입 이메일과 삭제를 원하는 채널을 알려주시고, 비밀번호·접근 토큰·인증코드는 보내지 마세요. 본인 확인 후 처리 결과를 안내합니다.</p>
        </section>
      </div>
      <a href="/" className="mt-10 inline-block text-[13px] text-[var(--color-amber)]">홈으로 →</a>
    </main>
  );
}
