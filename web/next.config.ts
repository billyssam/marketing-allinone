import type { NextConfig } from 'next';

/**
 * 보안 헤더 — 실사용자(사장님)의 매장·고객 데이터를 다루는 배포 SaaS의 기본 방어선.
 * Next.js 공식 production-checklist 대조에서 전무했던 것을 채움(2026-08-04).
 *
 * CSP는 여기 넣지 않았다: Supabase(REST/실시간)·Vercel·인라인 스타일까지 정확히 허용하지
 * 않으면 프로덕션이 조용히 깨진다. 파일럿 직전에 감수할 리스크가 아니라서,
 * 실측 가능한 시점에 report-only로 먼저 관찰한 뒤 적용할 항목으로 남긴다.
 */
const securityHeaders = [
  // 클릭재킹 방지 — 우리 화면을 남의 iframe에 넣어 사장님 클릭을 가로채는 공격 차단
  { key: 'X-Frame-Options', value: 'DENY' },
  // MIME 스니핑 차단 — 응답이 다른 타입으로 해석돼 실행되는 것 방지
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 외부로 나갈 때 경로·쿼리를 넘기지 않음(초안 id 등이 리퍼러로 새는 것 방지)
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 쓰지 않는 강력한 권한은 원천 차단
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // HTTPS 고정(Vercel이 기본 제공하지만 명시해 커스텀 도메인에서도 일관되게)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // 서비스 워커는 항상 최신을 받아야 배포가 즉시 반영된다(캐시된 옛 SW가 남지 않게)
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
