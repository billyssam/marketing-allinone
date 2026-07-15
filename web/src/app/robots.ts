import type { MetadataRoute } from 'next';

/** 검색엔진: 랜딩·로그인만 색인, 사장님 화면은 제외(어차피 307이지만 크롤 노이즈 차단) */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/onboarding', '/channels', '/reviews', '/regulars', '/settings', '/posts', '/prepare', '/api/'],
    },
    sitemap: 'https://marketing-allinone.vercel.app/sitemap.xml',
  };
}
