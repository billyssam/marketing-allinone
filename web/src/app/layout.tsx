import type { Metadata, Viewport } from 'next';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '마케팅올인원 — 자영업자 마케팅 종합 SaaS',
    template: '%s · 마케팅올인원',
  },
  description:
    '인스타·블로그·알림톡·리뷰 대응까지 하나로. 카카오톡 봇이 매일 아침 오늘의 마케팅을 준비합니다.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '마케팅올인원',
  },
  openGraph: {
    type: 'website',
    locale: 'ko_KR',
    title: '마케팅올인원 — 자영업자 마케팅 종합 SaaS',
    description: '인스타·블로그·알림톡·리뷰까지. 하루 5분으로 끝나는 마케팅.',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0a0a0c' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0c' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
