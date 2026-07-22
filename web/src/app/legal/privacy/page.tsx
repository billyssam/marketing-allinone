export const metadata = { title: '개인정보처리방침' };

/** 실제 서비스 동작 그대로 정직하게 기술 — 하지 않는 것을 약속하지 않고, 하는 것을 숨기지 않는다. */
const S = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-8">
    <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
    <div className="mt-2.5 space-y-2 text-[14px] leading-relaxed text-[var(--color-fg-2)]">{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <article>
      <div className="eyebrow">Legal</div>
      <h1 className="h1 mt-2">개인정보처리방침</h1>
      <p className="mt-2 text-[13px] text-[var(--color-fg-3)]">시행일: 2026년 7월 22일</p>

      <S title="1. 수집하는 정보">
        <p>마케팅올인원(이하 &ldquo;서비스&rdquo;)은 다음 정보를 수집·저장합니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b className="text-[var(--color-fg)]">계정</b>: 이메일 주소, 비밀번호(암호화 저장)</li>
          <li><b className="text-[var(--color-fg)]">매장 정보</b>: 상호, 업종, 주소, 판매 항목(메뉴·상품·가격), 네이버 플레이스·블로그 주소</li>
          <li><b className="text-[var(--color-fg)]">공개 리뷰</b>: 회원이 등록한 플레이스 주소에서 수집한 공개 리뷰 내용</li>
          <li><b className="text-[var(--color-fg)]">단골 정보</b>: 회원이 직접 입력한 고객 이름·연락처(선택 기능)</li>
          <li><b className="text-[var(--color-fg)]">생성 기록</b>: 서비스가 만든 콘텐츠 초안과 이용 활동 로그</li>
        </ul>
      </S>

      <S title="2. 이용 목적">
        <ul className="list-disc space-y-1 pl-5">
          <li>회원 식별과 로그인 등 서비스 제공</li>
          <li>매장 맞춤 마케팅 콘텐츠(블로그·SNS 초안, 리뷰 답글, 재방문 메시지) 생성</li>
          <li>리뷰 수집·감정 분석 등 매장 운영 지표 제공</li>
        </ul>
        <p>수집한 정보를 광고 판매, 제3자 마케팅 등 위 목적 외로 사용하지 않습니다.</p>
      </S>

      <S title="3. 처리 위탁 (인프라)">
        <p>서비스 운영을 위해 다음 사업자에게 데이터 처리를 위탁합니다. 각 사업자는 자체 보안·개인정보 기준을 따릅니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><b className="text-[var(--color-fg)]">Supabase</b> — 데이터베이스·인증 호스팅</li>
          <li><b className="text-[var(--color-fg)]">Vercel</b> — 웹 서비스 호스팅</li>
          <li><b className="text-[var(--color-fg)]">Google (Gemini API)</b> — 콘텐츠 초안 생성. 매장명·판매 항목·리뷰 등 콘텐츠 생성에 필요한 정보가 처리 과정에서 전달됩니다.</li>
          <li><b className="text-[var(--color-fg)]">GitHub</b> — 자동화 작업(정기 콘텐츠 생성·리뷰 수집) 실행</li>
        </ul>
      </S>

      <S title="4. 보유 기간과 파기">
        <p>회원 탈퇴 시 계정과 매장·콘텐츠·리뷰·단골 정보를 즉시 삭제합니다. 법령상 보존 의무가 있는 정보는 해당 기간 동안만 별도 보관 후 파기합니다.</p>
      </S>

      <S title="5. 단골(고객) 정보에 대한 책임">
        <p>단골 관리 기능에 입력하는 고객 이름·연락처는 회원이 해당 고객에게 안내·동의를 받아 입력해야 하며, 서비스는 회원의 지시에 따라 이를 저장·처리하는 역할만 합니다.</p>
      </S>

      <S title="6. 이용자의 권리">
        <p>회원은 언제든 설정 화면에서 매장 정보를 열람·수정할 수 있고, 계정 삭제(탈퇴)로 모든 데이터를 즉시 파기할 수 있습니다. 그 외 열람·정정·삭제 요청은 아래 연락처로 문의해 주세요.</p>
      </S>

      <S title="7. 문의">
        <p>개인정보 관련 문의: <a href="mailto:billy5285@gmail.com" className="text-[var(--color-amber)] hover:underline">billy5285@gmail.com</a></p>
      </S>
    </article>
  );
}
