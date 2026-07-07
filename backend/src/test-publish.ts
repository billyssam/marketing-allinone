import { readFileSync } from 'node:fs';
import { publishToChannels, collectHandoffs } from './publish.js';
import type { Connection } from '../../shared/channels/adapter.js';
import type { ChannelId } from '../../shared/channels/registry.js';

// 아까 생성된 채널 드래프트 번들 로드 (Gemini 재호출 없이 발행 라우팅만 검증)
const bundle = JSON.parse(readFileSync('../web/output/channel-drafts.json', 'utf-8'));
const perChannel: Record<string, unknown> = bundle.perChannel;

// 모의 연결 (실제로는 channel_connections 테이블에서 로드)
const connections: Partial<Record<ChannelId, Connection>> = {
  naver_blog: { channelId: 'naver_blog', storeId: 's1', status: 'connected', metadata: { blogId: 'billysir' } },
  naver_place: { channelId: 'naver_place', storeId: 's1', status: 'connected', externalId: '1565864790' },
  danggeun: { channelId: 'danggeun', storeId: 's1', status: 'connected' },
  instagram: { channelId: 'instagram', storeId: 's1', status: 'connected' }, // 토큰 없음 → auto 실패 예상
};

async function main() {
  console.log('=== 발행 라우팅 검증: 채널 드래프트 → 어댑터 ===\n');
  const outcomes = await publishToChannels(perChannel as never, connections);

  for (const o of outcomes) {
    const r = o.result;
    if (!r) {
      console.log(`[${o.channelId}] ⚠️ ${o.error}`);
      continue;
    }
    if (r.mode === 'assisted' && r.handoff) {
      console.log(`[${o.channelId}] 🟡 반자동 핸드오프`);
      console.log(`   딥링크: ${r.handoff.deeplink}`);
      console.log(`   클립보드: ${r.handoff.clipboard.map((c) => c.label).join(' → ')}`);
      console.log(`   단계: ${r.handoff.steps.length}개`);
    } else if (r.mode === 'auto') {
      console.log(`[${o.channelId}] 🟢 자동 발행 ${r.ok ? '성공: ' + r.externalUrl : '실패: ' + r.error}`);
    }
  }

  const handoffs = collectHandoffs(outcomes);
  console.log(`\n카톡봇으로 보낼 핸드오프: ${handoffs.length}건 (${handoffs.map((h) => h.channelId).join(', ')})`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
