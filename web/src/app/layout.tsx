import type { Metadata, Viewport } from 'next';
// 다이내믹 서브셋: 유니코드 범위별 92조각 — 화면에 쓰인 글리프 범위만 다운로드.
// 통짜 가변폰트(2.06MB)는 모바일 LCP를 13초로 만듦(Lighthouse 실측) → 절대 되돌리지 말 것.
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import { SwRegister } from '@/components/sw-register';
import { InAppNotice } from '@/components/inapp-notice';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://marketing-allinone.vercel.app'),
  title: {
    default: '마케팅올인원 — 자영업자 마케팅 종합 SaaS',
    template: '%s · 마케팅올인원',
  },
  description:
    '매장 정보에 맞춘 콘텐츠 초안과 리뷰 답글을 준비합니다. 내용을 확인하고 각 채널에서 게시하세요.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '마케팅올인원',
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    title: '마케팅올인원 — 자영업자 마케팅 종합 SaaS',
    description: '콘텐츠 초안과 리뷰 답글을 한 화면에서. 내용을 확인하고 직접 게시하세요.',
  },
};

export const viewport: Viewport = {
  // 앱 배경(globals.css --color-bg)과 일치 — 브라우저 크롬·PWA 상태바 이음새 제거
  themeColor: '#08080a',
  width: 'device-width',
  initialScale: 1,
  // maximumScale 제한 금지 — 저시력 사용자 핀치줌 차단은 접근성 위반(Lighthouse 실측 감점)
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen">
        {children}
        <SwRegister />
        <InAppNotice />
      </body>
    </html>
  );
}
