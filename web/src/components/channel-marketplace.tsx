import { GROUPS, channelsByGroup, CHANNELS, type ChannelGroup } from '@shared/channels/registry';
import { readinessOf } from '@shared/channels/readiness';
import { operatorReadyIntegrations } from '@/lib/operator-ready';

const ORDER: ChannelGroup[] = ['acquire', 'sell', 'retain', 'reputation', 'ads'];

export function ChannelMarketplace() {
  const total = CHANNELS.length;
  const operatorReady = operatorReadyIntegrations();
  return (
    <div>
      <div className="reveal flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">채널</div>
          <h2 className="h1 mt-4 max-w-2xl">
            <span className="amber-text">지원 채널</span>과 확장 계획.
            <br />
            <span className="text-[var(--color-fg-3)]">지금 쓸 수 있는 것부터.</span>
          </h2>
        </div>
        <div className="flex gap-4 text-[12px]">
          {['초안·직접 게시', '계정 연결', '연결 후 사용', '준비 중'].map(label => (
            <span key={label} className="text-[var(--color-fg-2)]">
              {label}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-4 text-[14px] text-[var(--color-fg-2)]">{total}개 채널의 지원 현황입니다. 준비 중인 채널은 사용할 수 없으며, 계정 연결과 실제 게시 여부는 별도로 확인합니다.</p>

      <div className="mt-10 space-y-8">
        {ORDER.map((g) => {
          const chans = channelsByGroup(g);
          if (!chans.length) return null;
          return (
            <div key={g} className="reveal">
              <div className="mb-3 flex items-baseline gap-3">
                <span className="text-[15px] font-medium">{GROUPS[g].label}</span>
                <span className="mono text-[11px] text-[var(--color-fg-3)]">{GROUPS[g].desc}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {chans.map((c) => {
                  const readiness = readinessOf(c.id, operatorReady);
                  const waiting = readiness === 'waiting';
                  const au = { label: waiting ? '준비 중' : readiness === 'ready' ? '직접 게시' : '계정 연결', color: waiting ? '#86847d' : '#ffb534' };
                  return (
                    <div key={c.id} className="spot panel rounded-[var(--radius)] p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                          <span className="text-[13.5px] font-medium">{c.name}</span>
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: `${au.color}1e`, color: au.color }}>
                          {au.label}
                        </span>
                      </div>
                      <div className="mono mt-2 truncate text-[10px] text-[var(--color-fg-3)]">{c.actions.join(' · ')}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
