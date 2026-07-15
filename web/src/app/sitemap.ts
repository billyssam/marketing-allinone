import type { MetadataRoute } from 'next';

const BASE = 'https://marketing-allinone.vercel.app';

/** 공개 페이지만 — 나머지는 로그인 벽 뒤 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/login`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE}/signup`, changeFrequency: 'monthly', priority: 0.5 },
  ];
}
