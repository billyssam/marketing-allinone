import Link from 'next/link';

export const metadata = { title: '확장 설치' };

/**
 * 확장 설치 안내.
 *
 * 이 화면의 유일한 일: **사장님이 5분 안에 설치를 끝내고 되돌아가게 하는 것.**
 * 그래서 설명을 늘어놓지 않고 눌러야 할 순서만 크게 둔다.
 * 무엇이 좋아지는지는 맨 위 한 줄로 끝낸다 — 설득은 이미 앞 화면에서 했다.
 */
const STEPS: { n: number; title: string; body: string; code?: string }[] = [
  {
    n: 1,
    title: '크롬 주소창에 아래를 입력하세요',
    body: '확장 관리 화면이 열립니다.',
    code: 'chrome://extensions',
  },
  {
    n: 2,
    title: '오른쪽 위 "개발자 모드"를 켜세요',
    body: '켜야 아래 버튼이 나타납니다.',
  },
  {
    n: 3,
    title: '"압축해제된 확장 프로그램을 로드합니다"를 누르세요',
    body: '폴더를 고르는 창이 뜹니다.',
  },
  {
    n: 4,
    title: '내려받은 폴더에서 extension 을 고르세요',
    body: '목록에 "마케팅올인원 — 원클릭 발행"이 뜨면 끝입니다.',
  },
];

export default function ExtensionGuidePage() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-2xl px-5 py-10 sm:px-6">
        <Link href="/channels" className="mono text-[12px] text-[var(--color-fg-3)] transition hover:text-[var(--color-fg)]">
          ← 채널
        </Link>

        <div className="eyebrow mt-6">크롬 확장</div>
        <h1 className="h1 mt-2">붙여넣기를 버튼 하나로</h1>
        <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--color-fg-2)]">
          설치하면 앱에서 버튼만 눌러도 네이버 블로그·플레이스 글쓰기 화면이
          <b className="text-[var(--color-fg)]"> 제목과 본문이 채워진 채로</b> 열립니다.
          아이디·비밀번호는 받지 않습니다 — 사장님이 이미 로그인해 둔 창을 그대로 씁니다.
        </p>

        {/* 순서가 정보다 — 번호는 장식이 아니라 실제로 이 차례대로 눌러야 한다 */}
        <ol className="mt-8 space-y-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flex gap-4 rounded-[var(--radius)] border border-[var(--color-hair)] bg-[var(--color-panel)] p-4"
            >
              <span className="mono mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--color-hair-strong)] text-[11px] text-[var(--color-fg-2)]">
                {s.n}
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-[var(--color-fg)]">{s.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--color-fg-2)]">{s.body}</p>
                {s.code && (
                  <code className="mono mt-2 block rounded-[var(--radius-sm)] border border-[var(--color-hair)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-[var(--color-fg)] select-all">
                    {s.code}
                  </code>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 rounded-[var(--radius)] border border-[var(--color-hair)] bg-[var(--color-panel-2)] p-4">
          <div className="eyebrow mb-2">설치한 뒤에</div>
          <p className="text-[13px] leading-relaxed text-[var(--color-fg-2)]">
            채널 화면으로 돌아가 새로고침하시면 <b className="text-[var(--color-fg)]">확장이 켜져 있어요</b>가 뜹니다.
            그다음부터 글마다 <b className="text-[var(--color-fg)]">바로 채우기</b> 버튼이 보입니다.
          </p>
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-[var(--color-fg-3)]">
            네이버 화면이 바뀌어 글을 못 넣게 되면 확장이 조용히 넘어가지 않습니다.
            오른쪽 아래에 <b className="text-[var(--color-fg-2)]">글은 복사해 뒀다</b>고 알려드리니 그대로 붙여넣으시면 됩니다.
          </p>
        </div>

        <Link
          href="/channels"
          className="btn-primary mt-8 inline-block rounded-full px-5 py-2.5 text-[14px] font-medium"
        >
          채널로 돌아가기
        </Link>
      </main>
    </div>
  );
}
