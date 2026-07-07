import { GROUPS, AUTOMATION_LABEL, channelsByGroup, CHANNELS, type ChannelGroup } from '@shared/channels/registry';

const ORDER: ChannelGroup[] = ['acquire', 'sell', 'retain', 'reputation', 'ads'];

export function ChannelMarketplace() {
  const total = CHANNELS.length;
  return (
    <div>
      <div className="reveal flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">채널</div>
          <h2 className="h1 mt-4 max-w-2xl">
            <span className="amber-text">{total}개+</span> 채널을 하나로.
            <br />
            <span className="text-[var(--color-fg-3)]">필요한 것만 켜세요.</span>
          </h2>
        </div>
        <div className="flex gap-4 text-[12px]">
          {Object.entries(AUTOMATION_LABEL).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-[var(--color-fg-2)]">
              <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
              {v.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-10 space-y-8">
        {ORDER.map((g) => {
          const chans = channelsByGroup(g);
          if (!chans.length) return null;
          return (
            <div key={g} className="reveal">
              <div className="mb-3 flex items-baseline gap-3">
                <span className="text-[15px] font-semibold">{GROUPS[g].label}</span>
                <span className="mono text-[11px] text-[var(--color-fg-3)]">{GROUPS[g].desc}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {chans.map((c) => {
                  const au = AUTOMATION_LABEL[c.automation];
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
                        {c.status === 'live' && <span className="mono text-[9px] text-[var(--color-good)]">● 라이브</span>}
                        {c.status === 'wip' && <span className="mono text-[9px] text-[var(--color-fg-3)]">개발중</span>}
                        {c.status === 'planned' && <span className="mono text-[9px] text-[var(--color-fg-4)]">예정</span>}
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
