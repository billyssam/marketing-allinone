import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { BriefingCard } from '@/components/briefing-card';
import { DashboardPreview } from '@/components/dashboard-preview';
import { ChannelMarketplace } from '@/components/channel-marketplace';
import { LandingFx } from '@/components/landing-fx';

export default function LandingPage() {
  return (
    <>
      <LandingFx />
      <SiteHeader />

      {/* ===== HERO ===== */}
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-16 lg:pb-24 lg:pt-20">
        <div>
          <div className="rise inline-flex items-center gap-2 rounded-full border border-[var(--color-hair)] bg-[var(--color-panel)] px-3 py-1.5">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--color-good)] text-[var(--color-good)]" />
            <span className="mono text-[11px] text-[var(--color-fg-2)]">2026 · 파일럿 신청 접수 중</span>
          </div>

          {/* 한글 조판: 어절 중간 절단 금지(keep-all) — "끝나/있어요" 분리는 결함 */}
          <h1 className="display rise r2 mt-6">
            매일 아침 9시,<br />
            마케팅이 <span className="amber-text">끝나있어요</span>.
          </h1>

          <p className="rise r3 mt-6 max-w-md text-[16px] leading-relaxed text-[var(--color-fg-2)] sm:text-[17px]">
            인스타·블로그·리뷰 답글까지 AI가 매일 아침 준비해둡니다.
            사장님은 확인하고 붙여넣기만. <span className="text-[var(--color-fg)]">하루 5분이면 끝나요.</span>
          </p>

          <div className="rise r4 mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="btn-primary rounded-full px-5 py-3 text-[14px] font-medium">
              무료로 시작하기
            </Link>
            <Link href="#dashboard" className="rounded-full border border-[var(--color-hair-strong)] px-5 py-3 text-[14px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-panel)]">
              대시보드 보기 →
            </Link>
          </div>

          <div className="rise r5 mt-12 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--color-hair)] bg-[var(--color-hair)]">
            <Stat n={12} suffix="초" label="콘텐츠 생성" />
            <Stat n={30} suffix="초" label="블로그 발행" />
            <Stat n={7} suffix="개" label="채널 연결" />
          </div>
        </div>

        <div className="rise r3 flex justify-center lg:justify-end">
          <BriefingCard />
        </div>
      </section>

      {/* ===== channel marquee ===== */}
      <div className="relative overflow-hidden border-y border-[var(--color-hair)] py-5">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-[var(--color-bg)] to-transparent sm:w-28" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-[var(--color-bg)] to-transparent sm:w-28" />
        <div className="marq px-6">
          {[...CHANNELS, ...CHANNELS].map((c, i) => (
            <span key={i} className="mono flex items-center gap-2 whitespace-nowrap text-[13px] text-[var(--color-fg-3)]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
              {c.name}
            </span>
          ))}
        </div>
      </div>

      {/* ===== features ===== */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="reveal lg:sticky lg:top-28 lg:self-start">
            <div className="eyebrow">기능</div>
            <h2 className="h1 mt-4">채널마다<br />필요한 도구,<br /><span className="text-[var(--color-fg-3)]">한 화면에서.</span></h2>
            <p className="mt-5 max-w-xs text-[15px] leading-relaxed text-[var(--color-fg-2)]">
              흩어진 마케팅 채널을 하나의 리듬으로. 자동은 자동으로, 손이 필요한 건 30초로.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={`spot reveal panel rounded-[var(--radius-lg)] p-5 ${i === 0 ? 'sm:col-span-2' : ''}`}
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl text-[18px]" style={{ background: `${f.color}1c`, color: f.color, boxShadow: `inset 0 0 0 1px ${f.color}30` }}>
                    {f.icon}
                  </span>
                  {f.soon ? (
                    <span className="mono rounded-full border border-[var(--color-hair-strong)] px-2 py-0.5 text-[10px] text-[var(--color-fg-3)]">
                      준비중
                    </span>
                  ) : (
                    <span className="mono text-[10px]" style={{ color: f.color }}>{f.tag}</span>
                  )}
                </div>
                <h3 className="mt-4 text-[17px] font-medium">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[var(--color-fg-2)]">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== channel marketplace ===== */}
      <section id="channels" className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
        <ChannelMarketplace />
      </section>

      {/* ===== dashboard ===== */}
      <section id="dashboard" className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
        <div className="reveal">
          <div className="eyebrow">대시보드</div>
          <h2 className="h1 mt-4 max-w-2xl">감이 아니라 데이터로.<br /><span className="text-[var(--color-fg-3)]">모든 채널을 한 화면에서.</span></h2>
        </div>
        <div className="reveal panel mt-10 rounded-[var(--radius-lg)] p-2.5 sm:p-3">
          <DashboardPreview />
        </div>
      </section>

      {/* ===== pricing ===== */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
        <div className="reveal">
          <div className="eyebrow">가격</div>
          <h2 className="h1 mt-4 max-w-xl">파일럿은 무료.<br /><span className="text-[var(--color-fg-3)]">정식 출시 후 월 5만원부터.</span></h2>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <Price name="파일럿" price="₩0" period="3개월" highlight feats={['전 채널 무제한', '매일 초안 · 대시보드', '주 1회 피드백', '이후 전환 자유']} cta="파일럿 신청" href="/signup" delay={0} />
          <Price name="스탠다드" price="₩49,000" period="월" feats={['인스타·블로그·알림톡', '네이버 리뷰 관리', '단골 500명', '이메일 지원']} cta="출시 대기" delay={60} />
          <Price name="프로" price="₩99,000" period="월" feats={['스탠다드 전부', '배민·요기요·쿠팡', '단골 무제한', '카톡 채팅 지원']} cta="출시 대기" delay={120} />
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-6">
        <div className="reveal panel overflow-hidden rounded-[var(--radius-lg)] px-6 py-16 text-center sm:py-24">
          <h3 className="h1 mx-auto max-w-xl">매장 정보 한 번 등록하고,<br /><span className="amber-text">내일 아침 초안</span>을 확인하세요.</h3>
          <div className="mt-9 flex justify-center">
            <Link href="/signup" className="btn-primary rounded-full px-6 py-3.5 text-[14px] font-medium">
              무료로 시작하기
            </Link>
          </div>
        </div>
        <footer className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-[var(--color-hair)] pt-8 text-[12px] text-[var(--color-fg-3)] sm:flex-row">
          <span>© 2026 마케팅올인원 · 사업자 등록 예정</span>
          <div className="flex gap-6">
            <Link href="/legal/terms" className="hover:text-[var(--color-fg-2)]">이용약관</Link>
            <Link href="/legal/privacy" className="hover:text-[var(--color-fg-2)]">개인정보처리방침</Link>
          </div>
        </footer>
      </section>
    </>
  );
}

const CHANNELS = [
  { name: '인스타그램', color: '#ff4d8d' },
  { name: '네이버 블로그', color: '#16d66a' },
  { name: '카카오 알림톡', color: '#ffcd3c' },
  { name: '네이버 플레이스', color: '#16d66a' },
  { name: '배달의민족', color: '#2ac1bc' },
  { name: '요기요', color: '#fa0050' },
  { name: '구글 비즈니스', color: '#4285f4' },
];

/**
 * 기능 카드 — 채널 마켓플레이스와 같은 정직 기준.
 * soon: true면 '준비중' 뱃지. 파일럿 사장님이 없는 기능을 기다리게 두지 않는다.
 */
const FEATURES: { title: string; tag?: string; color: string; icon: string; soon?: boolean; body: string }[] = [
  { title: 'AI 콘텐츠 엔진', tag: '핵심', color: '#ffb534', icon: '✦', body: '네이버 플레이스에서 매장 정보를 크롤하고 리뷰 톤까지 학습해, 업종별 카피를 자동 생성합니다. 메뉴·가격·영업시간 같은 실제 사실이 글에 그대로 들어갑니다.' },
  { title: '매일 아침 초안', tag: '완전 자동', color: '#16d66a', icon: '✦', body: '매일 아침 7시 30분, 블로그·인스타 초안이 대시보드에 준비됩니다. 확인하고 30초 붙여넣기.' },
  { title: '리뷰 감정 모니터링', tag: '하루 3회', color: '#ff5f83', icon: '★', body: '네이버 리뷰를 자동 수집해 긍정·부정을 분류하고, 답글 초안까지 매장 톤으로 써둡니다.' },
  { title: '통합 성과 대시보드', tag: '분석', color: '#38e2a4', icon: '◈', body: '발행량·리뷰 감정·주간 활동을 한 화면에서. 오늘 할 일은 아침 브리핑으로.' },
  { title: '인스타그램 자동 발행', color: '#ff4d8d', icon: '◎', soon: true, body: '지금은 캡션을 자동 생성해 붙여넣기로 발행합니다. Meta 공식 API 예약 발행은 준비 중.' },
  { title: '재방문 알림톡', color: '#ffcd3c', icon: '⚡', soon: true, body: '단골 이탈을 감지해 메시지 초안까지 만들어 둡니다. 알림톡 자동 발송은 채널 심사 후 연결 예정.' },
];

function Stat({ n, suffix, label }: { n: number; suffix: string; label: string }) {
  return (
    <div className="bg-[var(--color-bg)] px-4 py-5 sm:px-5">
      <div className="text-2xl font-semibold tnum sm:text-3xl">
        <span data-count={n} data-suffix={suffix}>0{suffix}</span>
      </div>
      <div className="mt-1 text-[11px] text-[var(--color-fg-3)] sm:text-xs">{label}</div>
    </div>
  );
}

function Price({ name, price, period, feats, cta, href, highlight, delay }: { name: string; price: string; period: string; feats: string[]; cta: string; href?: string; highlight?: boolean; delay: number }) {
  return (
    <div className={`spot reveal rounded-[var(--radius-lg)] p-7 ${highlight ? 'border-2 border-[var(--color-amber)] bg-[var(--color-panel)]' : 'panel'}`} style={{ transitionDelay: `${delay}ms` }}>
      {highlight && <div className="mono mb-4 inline-block rounded-full bg-[var(--color-amber)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--color-amber-ink)]">지금 파일럿</div>}
      <div className="text-[14px] text-[var(--color-fg-2)]">{name}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-4xl font-semibold tnum tracking-tight">{price}</span>
        <span className="text-[13px] text-[var(--color-fg-3)]">/ {period}</span>
      </div>
      <ul className="mt-7 space-y-2.5 text-[14px] text-[var(--color-fg-2)]">
        {feats.map((f) => (
          <li key={f} className="flex items-center gap-2.5"><span className="text-[var(--color-amber)]">✓</span>{f}</li>
        ))}
      </ul>
      {href ? (
        <Link href={href} className={`mono mt-8 block w-full rounded-full py-2.5 text-center text-[13px] font-medium ${highlight ? 'btn-primary' : 'border border-[var(--color-hair-strong)] text-[var(--color-fg-2)]'}`}>{cta}</Link>
      ) : (
        // 출시 전 플랜 — 눌러도 갈 곳이 없으니 정직하게 비활성
        <button type="button" disabled className="mono mt-8 w-full cursor-not-allowed rounded-full border border-[var(--color-hair)] py-2.5 text-[13px] font-medium text-[var(--color-fg-4)]">{cta}</button>
      )}
    </div>
  );
}
