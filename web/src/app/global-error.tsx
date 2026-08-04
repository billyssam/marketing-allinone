'use client';

/**
 * 루트 레이아웃까지 깨진 최후의 오류 화면.
 * error.tsx는 레이아웃이 살아있을 때만 동작한다 → 이 파일이 없으면 사장님이 **흰 화면**을 본다.
 * 레이아웃이 없는 상태라 html/body를 직접 그리고, 폰트·색도 인라인으로 최소 지정한다.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#08080a',
          color: '#f2f0ed',
          padding: 24,
          fontFamily:
            "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          wordBreak: 'keep-all',
        }}
      >
        <div style={{ maxWidth: '22rem', textAlign: 'center' }}>
          <div
            style={{
              width: 44,
              height: 44,
              margin: '0 auto 20px',
              borderRadius: 10,
              background: '#f5a524',
              color: '#1a1206',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 600,
              fontSize: 18,
            }}
          >
            ㅁ
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 620, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
            잠시 문제가 생겼어요
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: '#a8a49e', margin: '0 0 22px' }}>
            다시 시도하면 대부분 해결됩니다.
            <br />
            오늘 준비된 초안은 그대로 저장돼 있어요.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={() => reset()}
              style={{
                border: 0,
                borderRadius: 999,
                padding: '12px 22px',
                fontSize: 14,
                fontWeight: 500,
                background: '#f2f0ed',
                color: '#08080a',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              다시 시도
            </button>
            <a
              href="/dashboard"
              style={{
                borderRadius: 999,
                padding: '12px 22px',
                fontSize: 14,
                fontWeight: 500,
                border: '1px solid #2a2926',
                color: '#a8a49e',
                textDecoration: 'none',
              }}
            >
              대시보드로
            </a>
          </div>
          {error?.digest && (
            <p style={{ marginTop: 18, fontSize: 11, color: '#5c5954', fontFamily: 'monospace' }}>
              오류 코드 {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
