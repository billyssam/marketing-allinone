import 'dotenv/config';
import cron from 'node-cron';
import { dailyBlogDraft } from './flows/daily-blog-draft.js';

console.log('🤖 마케팅올인원 카톡봇 v0.1 시작');

// 매일 09:00 KST — 오늘의 블로그 초안 발송
// 서버 UTC 기준 00:00 = KST 09:00
cron.schedule('0 0 * * *', async () => {
  console.log('[cron] daily-blog-draft 실행');
  try {
    await dailyBlogDraft();
  } catch (err) {
    console.error('[cron] daily-blog-draft 실패:', err);
  }
}, { timezone: 'Asia/Seoul' });

// 매 30분 — 리뷰 모니터링 폴링 (M2에서 활성화)
// cron.schedule('*/30 * * * *', reviewMonitor);

// TODO(M2): 웹훅 처리 (카카오/알리고 발송 결과 콜백)
// import express from 'express';
// const app = express();
// app.post('/webhooks/alimtalk/callback', ...);

console.log('⏰ 크론 등록 완료');
