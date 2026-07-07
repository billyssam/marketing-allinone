/**
 * 매일 09:00 KST — 모든 활성 매장에 오늘의 블로그 초안 알림톡 발송
 * 흐름:
 *   1) DB에서 오늘 발송 대상 매장 조회
 *   2) 매장별 콘텐츠 엔진 실행 → 제목·본문·태그 생성
 *   3) 초안 저장 (posts 테이블)
 *   4) 알림톡 발송 (버튼: "보내기" → 딥링크로 앱 오픈)
 */

import { getSupabase } from '../lib/supabase.js';
import { sendAlimtalk } from '../messenger/aligo.js';

export async function dailyBlogDraft(): Promise<void> {
  const supabase = getSupabase();
  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, owner_phone, industry_id, brand_tone, naver_place_url')
    .eq('subscription_status', 'active')
    .eq('channel_blog_enabled', true);

  if (error) throw error;
  if (!stores?.length) {
    console.log('[daily-blog-draft] 대상 매장 없음');
    return;
  }

  console.log(`[daily-blog-draft] ${stores.length}개 매장 처리`);

  for (const store of stores) {
    try {
      // TODO(M1 후반): 콘텐츠 엔진 호출 → 초안 생성
      // const draft = await generateBlogDraft(store);
      // await supabase.from('posts').insert({ ... });

      // 알림톡 발송 (템플릿은 승인 후 코드 세팅)
      const prepareUrl = `${process.env.PWA_BASE_URL}/prepare?post=DRAFT_ID`;

      await sendAlimtalk({
        templateCode: process.env.ALIMTALK_TEMPLATE_DAILY_BLOG!,
        receiver: store.owner_phone,
        message:
          `${store.name} 오늘의 블로그 초안이 준비됐어요!\n\n` +
          `지금 [보내기]를 누르면 30초 만에 블로그에 올릴 수 있어요.`,
        buttons: [
          {
            name: '보내기',
            linkType: 'WL',
            linkMo: prepareUrl,
            linkPc: prepareUrl,
          },
          {
            name: '건너뛰기',
            linkType: 'WL',
            linkMo: `${process.env.PWA_BASE_URL}/skip?post=DRAFT_ID`,
            linkPc: `${process.env.PWA_BASE_URL}/skip?post=DRAFT_ID`,
          },
        ],
      });

      console.log(`[daily-blog-draft] ✅ ${store.name} 발송 완료`);
    } catch (err) {
      console.error(`[daily-blog-draft] ❌ ${store.name} 실패:`, err);
    }
  }
}
