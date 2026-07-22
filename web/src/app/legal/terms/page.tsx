export const metadata = { title: '이용약관' };

const S = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-8">
    <h2 className="text-[16px] font-semibold tracking-tight">{title}</h2>
    <div className="mt-2.5 space-y-2 text-[14px] leading-relaxed text-[var(--color-fg-2)]">{children}</div>
  </section>
);

export default function TermsPage() {
  return (
    <article>
      <div className="eyebrow">Legal</div>
      <h1 className="h1 mt-2">이용약관</h1>
      <p className="mt-2 text-[13px] text-[var(--color-fg-3)]">시행일: 2026년 7월 22일</p>

      <S title="1. 서비스 내용">
        <p>마케팅올인원(이하 &ldquo;서비스&rdquo;)은 자영업자·소상공인을 위한 마케팅 도구로, 다음 기능을 제공합니다.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>매장 정보 기반 마케팅 콘텐츠 초안 자동 생성(블로그·SNS 등)</li>
          <li>공개 리뷰 수집·감정 분석과 답글 초안</li>
          <li>단골 고객 관리와 재방문 메시지 작성 지원</li>
        </ul>
      </S>

      <S title="2. AI 생성 콘텐츠의 성격 (중요)">
        <p>서비스가 만드는 콘텐츠는 인공지능이 생성한 <b className="text-[var(--color-fg)]">초안</b>입니다. 사실과 다른 내용이 포함될 수 있으므로, 회원은 발행 전 내용(가격·영업시간·표현 등)을 확인할 책임이 있습니다. 발행된 콘텐츠로 발생하는 결과에 대한 책임은 발행 주체인 회원에게 있습니다.</p>
      </S>

      <S title="3. 이용 요금">
        <p>파일럿 기간에는 무료로 제공됩니다. 유료 전환 시 최소 30일 전에 안내하며, 회원이 동의하지 않으면 결제 없이 이용을 종료할 수 있습니다. 안내 없이 자동 결제되는 경우는 없습니다.</p>
      </S>

      <S title="4. 회원의 의무">
        <ul className="list-disc space-y-1 pl-5">
          <li>본인 매장의 정보만 등록하고, 타인의 권리를 침해하는 정보를 입력하지 않습니다.</li>
          <li>단골 관리에 입력하는 고객 정보는 해당 고객의 동의를 받은 것이어야 합니다.</li>
          <li>서비스를 스팸 발송, 허위 리뷰 생성 등 부정한 용도로 사용하지 않습니다.</li>
        </ul>
      </S>

      <S title="5. 서비스 변경·중단">
        <p>서비스는 기능을 개선하거나 변경할 수 있습니다. 서비스 전체를 종료하는 경우 최소 30일 전에 안내하며, 회원이 데이터를 내려받을 수 있는 기간을 제공합니다.</p>
      </S>

      <S title="6. 면책">
        <p>서비스는 외부 플랫폼(네이버·인스타그램 등)의 정책 변경, 천재지변 등 통제할 수 없는 사유로 인한 손해에 대해 책임지지 않습니다. 무료 제공 기간의 서비스는 &ldquo;있는 그대로&rdquo; 제공됩니다.</p>
      </S>

      <S title="7. 탈퇴와 데이터 삭제">
        <p>회원은 언제든 설정 화면에서 계정을 삭제할 수 있으며, 삭제 즉시 모든 데이터가 파기됩니다(개인정보처리방침 제4조).</p>
      </S>

      <S title="8. 문의">
        <p>약관 관련 문의: <a href="mailto:billy5285@gmail.com" className="text-[var(--color-amber)] hover:underline">billy5285@gmail.com</a></p>
      </S>
    </article>
  );
}
