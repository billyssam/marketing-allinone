import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateChannelDrafts, type MasterImage } from '../../shared/content-engine';
import type { DraftInput } from '../../shared/content-engine';
import type { ChannelId } from '../../shared/channels/registry';

// 쿵더쿵 카페 — 이미 크롤한 실데이터 (라이브 크롤 생략, B구간 로직 격리 검증)
const input: DraftInput = {
  store: {
    id: 'pilot-kungdukung',
    name: '쿵더쿵 카페',
    industryId: 'cafe',
    naverPlaceUrl: 'https://m.place.naver.com/place/1565864790/home',
    address: '충북 옥천군 안내면 현리3길 16 쿵더쿵',
    brandTone: {
      voice: '따뜻·정겨운·시골 카페 인심 (자극형 표현 배제)',
      positioning: '옥천/대청호 관광 벨트의 아기자기·정겨운 시골 카페',
      signature_menu: ['수제대추차', '쿵더쿵초콜릿', '눈꽃빙수'],
      signature_moments: [
        '사장님이 직접 재배한 석류를 손님에게 따 주시는 인심',
        '서비스로 나오는 수제 초콜릿',
        '매장 고양이(냥이)와의 만남',
      ],
      seo_keywords: ['옥천 카페', '옥천 안내면 카페', '대청호 카페', '옥천 나들이', '수제대추차'],
      avoid_expressions: ['인생 카페', '미쳤다', '핫플'],
    },
  },
  place: {
    name: '쿵더쿵 카페',
    address: '충북 옥천군 안내면 현리3길 16 쿵더쿵',
    phone: '043-733-6616',
    hours: '20:00 라스트오더 (동절기 저녁 8시까지)',
    categories: ['카페'],
    descriptionRaw: '현리교차로 현리사거리 버스정류장 뒤 건물',
    menu: [
      { name: '수제대추차', price: 5800 },
      { name: '눈꽃빙수', price: 12000 },
      { name: '쿵더쿵초콜릿', price: 10000 },
      { name: '플레인크로플', price: 4000 },
    ],
  },
  photos: [],
  targetLength: 'medium',
  angle: '초회 방문객에게 옥천 시골 카페의 진짜 매력 소개',
};

const images: MasterImage[] = [
  { url: 'https://example.com/kungdukung-1.jpg', alt: '수제대추차' },
  { url: 'https://example.com/kungdukung-2.jpg', alt: '매장 전경' },
];

const CHANNELS: ChannelId[] = ['naver_blog', 'instagram', 'naver_place', 'danggeun'];

async function main() {
  console.log('=== B구간 검증: 사진 1장·매장정보 → 마스터 1개 → 채널 4개 재단 ===\n');
  const t0 = Date.now();
  const bundle = await generateChannelDrafts(input, CHANNELS, images);
  console.log(`마스터 생성 완료 (${Date.now() - t0}ms)`);
  console.log(`제목: ${bundle.master.title}`);
  console.log(`태그: ${bundle.master.tags.join(', ')}\n`);

  for (const ch of CHANNELS) {
    const d = bundle.perChannel[ch];
    console.log(`\n──────── [${ch}] (${d.meta?.format}) ────────`);
    if (d.title) console.log(`제목: ${d.title}`);
    const preview = (d.bodyPlain ?? d.bodyHtml ?? '').slice(0, 220);
    console.log(`본문(${(d.bodyPlain ?? d.bodyHtml ?? '').length}자): ${preview}${preview.length >= 220 ? '…' : ''}`);
    if (d.tags?.length) console.log(`태그: ${d.tags.length}개`);
    console.log(`이미지: ${d.images?.length ?? 0}장`);
  }

  mkdirSync('output', { recursive: true });
  writeFileSync('output/channel-drafts.json', JSON.stringify(bundle, null, 2), 'utf-8');
  console.log('\n📄 저장: web/output/channel-drafts.json');
}

main().catch((e) => {
  console.error('❌ 실패:', e.message);
  process.exit(1);
});
