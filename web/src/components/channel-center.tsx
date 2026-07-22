'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  CHANNELS,
  GROUPS,
  AUTOMATION_LABEL,
  type ChannelGroup,
  type ChannelId,
} from '@shared/channels/registry';
import { toggleChannel } from '@/app/channels/actions';
import { AppHeader } from '@/components/app-header';

const ORDER: ChannelGroup[] = ['acquire', 'sell', 'retain', 'reputation', 'ads'];

export function ChannelCenter({
  storeName,
  initialConnected,
  recommended = [],
  bizLabel,
}: {
  storeName: string;
  initialConnected: string[];
  /** 이 사업 유형에 맞는 추천 채널 id (적응 엔진) */
  recommended?: string[];
  bizLabel?: string;
}) {
  const [connected, setConnected] = useState<Set<ChannelId>>(() => new Set(initialConnected as ChannelId[]));
  const [busy, setBusy] = useState<ChannelId | null>(null);
  const [, startTransition] = useTransition();
  const recSet = useMemo(() => new Set(recommended), [recommended]);

  const stats = useMemo(() => {
    const live = CHANNELS.filter((c) => c.status !== 'planned').length;
    return { connected: connected.size, live, total: CHANNELS.length };
  }, [connected]);

  function toggle(id: ChannelId, canConnect: boolean) {
    if (!canConnect || busy) return;
    const willConnect = !connected.has(id);
    // 낙관적 업데이트
    setConnected((prev) => {
      const next = new Set(prev);
      willConnect ? next.add(id) : next.delete(id);
      return next;
    });
    setBusy(id);
    startTransition(async () => {
      const res = await toggleChannel(id, willConnect);
      if (res.error) {
        // 실패 시 롤백
        setConnected((prev) => {
          const next = new Set(prev);
          willConnect ? next.delete(id) : next.add(id);
          return next;
        });
      }
      setBusy(null);
    });
  }

  return (
    <div className="min-h-screen">
      <AppHeader storeName={storeName} current="/channels" />

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
        <div className="eyebrow">채널 연결 센터</div>
        <h1 className="h1 mt-3">내 장사에 맞는 채널만 켜세요.</h1>
        <p className="mt-3 max-w-lg text-[15px] text-[var(--color-fg-2)]">
          {bizLabel ? (
            <><span className="text-[var(--color-amber)]">{bizLabel}</span>에 맞는 채널을 <span className="text-[var(--color-fg)]">추천</span>으로 표시했어요. </>
          ) : null}
          연결한 채널은 매일 아침 브리핑에 함께 준비됩니다. 필요 없는 건 꺼두세요.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--color-hair)] bg-[var(--color-hair)]">
          <Stat label="연결됨" value={stats.connected} accent />
          <Stat label="사용 가능" value={stats.live} />
          <Stat label="전체 채널" value={stats.total} />
        </div>

        <div className="mt-12 space-y-10">
          {ORDER.map((g) => {
            // 추천 채널을 그룹 안에서 우선 노출(적응) → 그 다음 원래 우선순위
            const chans = CHANNELS.filter((c) => c.group === g).sort((a, b) => {
              const ra = recSet.has(a.id) ? 0 : 1;
              const rb = recSet.has(b.id) ? 0 : 1;
              return ra !== rb ? ra - rb : a.priority - b.priority;
            });
            if (!chans.length) return null;
            return (
              <section key={g}>
                <div className="mb-4 flex items-baseline gap-3">
                  <h2 className="text-[17px] font-medium">{GROUPS[g].label}</h2>
                  <span className="mono text-[11px] text-[var(--color-fg-3)]">{GROUPS[g].desc}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {chans.map((c) => {
                    const au = AUTOMATION_LABEL[c.automation];
                    const isOn = connected.has(c.id);
                    const canConnect = c.status !== 'planned';
                    const isBusy = busy === c.id;
                    const isRec = recSet.has(c.id);
                    return (
                      <div key={c.id} className={`panel spot rounded-[var(--radius-lg)] p-5 ${isOn ? 'ring-1 ring-[var(--color-amber)]/40' : isRec ? 'ring-1 ring-[var(--color-amber)]/20' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-9 w-9 place-items-center rounded-lg text-[13px] font-semibold" style={{ background: `${c.color}1e`, color: c.color }}>
                              {c.name.slice(0, 1)}
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[14px] font-medium">{c.name}</span>
                                {isRec && <span className="mono rounded-full bg-[var(--color-amber)]/15 px-1.5 text-[9px] text-[var(--color-amber)]">추천</span>}
                              </div>
                              <div className="mono mt-0.5 text-[10px]" style={{ color: au.color }}>{au.label}</div>
                            </div>
                          </div>
                          <Toggle on={isOn} disabled={!canConnect || isBusy} onClick={() => toggle(c.id, canConnect)} />
                        </div>

                        <div className="mono mt-3 flex flex-wrap gap-1.5">
                          {c.actions.map((a) => (
                            <span key={a} className="rounded bg-[var(--color-panel-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-fg-3)]">{a}</span>
                          ))}
                        </div>

                        {c.requires?.length ? (
                          <div className="mt-3 text-[11px] text-[var(--color-fg-3)]">준비물: {c.requires.join(', ')}</div>
                        ) : null}

                        <button
                          type="button"
                          disabled={!canConnect || isBusy}
                          onClick={() => toggle(c.id, canConnect)}
                          className={`mt-4 w-full rounded-full py-2 text-[12px] font-medium transition disabled:opacity-60 ${
                            !canConnect
                              ? 'cursor-not-allowed border border-[var(--color-hair)] text-[var(--color-fg-4)]'
                              : isOn
                                ? 'border border-[var(--color-hair-strong)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'
                                : 'bg-[var(--color-fg)] text-[var(--color-bg)]'
                          }`}
                        >
                          {!canConnect ? '출시 예정' : isBusy ? '저장 중…' : isOn ? '연결 해제' : '연결하기'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-[var(--color-bg)] px-5 py-5">
      <div className={`text-3xl font-semibold tnum ${accent ? 'amber-text' : ''}`}>{value}</div>
      <div className="mt-1 text-[11px] text-[var(--color-fg-3)]">{label}</div>
    </div>
  );
}

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition disabled:opacity-60 ${
        disabled && !on ? 'cursor-not-allowed bg-[var(--color-panel-2)]' : on ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-panel-2)]'
      }`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
