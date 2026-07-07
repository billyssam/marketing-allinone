'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CHANNELS,
  GROUPS,
  AUTOMATION_LABEL,
  type ChannelGroup,
  type ChannelId,
} from '@shared/channels/registry';

const ORDER: ChannelGroup[] = ['acquire', 'sell', 'retain', 'reputation', 'ads'];

export default function ChannelCenter() {
  // 데모 초기 연결 상태 (실제로는 Supabase channel_connections에서 로드)
  const [connected, setConnected] = useState<Set<ChannelId>>(
    () => new Set<ChannelId>(['naver_blog', 'instagram', 'kakao_alimtalk']),
  );

  const stats = useMemo(() => {
    const live = CHANNELS.filter((c) => c.status !== 'planned').length;
    return { connected: connected.size, live, total: CHANNELS.length };
  }, [connected]);

  function toggle(id: ChannelId, canConnect: boolean) {
    if (!canConnect) return;
    setConnected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen">
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b border-[var(--color-hair)] bg-[var(--color-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-amber)] font-mono text-[13px] font-bold text-[var(--color-amber-ink)]">ㅁ</span>
            <span className="text-[15px] font-semibold tracking-tight">마케팅올인원</span>
          </Link>
          <nav className="flex items-center gap-6 text-[13px] text-[var(--color-fg-2)]">
            <Link href="/channels" className="text-[var(--color-fg)]">채널 연결</Link>
            <Link href="/" className="hover:text-[var(--color-fg)]">대시보드</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
        <div className="eyebrow">채널 연결 센터</div>
        <h1 className="h1 mt-3">내 장사에 맞는 채널만 켜세요.</h1>
        <p className="mt-3 max-w-lg text-[15px] text-[var(--color-fg-2)]">
          연결한 채널은 매일 아침 브리핑에 함께 준비됩니다. 필요 없는 건 꺼두세요.
        </p>

        {/* stat strip */}
        <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--color-hair)] bg-[var(--color-hair)]">
          <Stat label="연결됨" value={stats.connected} accent />
          <Stat label="사용 가능" value={stats.live} />
          <Stat label="전체 채널" value={stats.total} />
        </div>

        <div className="mt-12 space-y-10">
          {ORDER.map((g) => {
            const chans = CHANNELS.filter((c) => c.group === g).sort((a, b) => a.priority - b.priority);
            if (!chans.length) return null;
            return (
              <section key={g}>
                <div className="mb-4 flex items-baseline gap-3">
                  <h2 className="text-[17px] font-semibold">{GROUPS[g].label}</h2>
                  <span className="mono text-[11px] text-[var(--color-fg-3)]">{GROUPS[g].desc}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {chans.map((c) => {
                    const au = AUTOMATION_LABEL[c.automation];
                    const isOn = connected.has(c.id);
                    const canConnect = c.status !== 'planned';
                    return (
                      <div key={c.id} className={`panel spot rounded-[var(--radius-lg)] p-5 ${isOn ? 'ring-1 ring-[var(--color-amber)]/40' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-9 w-9 place-items-center rounded-lg text-[13px] font-bold" style={{ background: `${c.color}1e`, color: c.color }}>
                              {c.name.slice(0, 1)}
                            </span>
                            <div>
                              <div className="text-[14px] font-semibold">{c.name}</div>
                              <div className="mono mt-0.5 text-[10px]" style={{ color: au.color }}>{au.label}</div>
                            </div>
                          </div>
                          <Toggle on={isOn} disabled={!canConnect} onClick={() => toggle(c.id, canConnect)} />
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
                          disabled={!canConnect}
                          onClick={() => toggle(c.id, canConnect)}
                          className={`mt-4 w-full rounded-full py-2 text-[12px] font-semibold transition ${
                            !canConnect
                              ? 'cursor-not-allowed border border-[var(--color-hair)] text-[var(--color-fg-4)]'
                              : isOn
                                ? 'border border-[var(--color-hair-strong)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'
                                : 'bg-[var(--color-fg)] text-[var(--color-bg)]'
                          }`}
                        >
                          {!canConnect ? '출시 예정' : isOn ? '연결 해제' : '연결하기'}
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
      <div className={`text-3xl font-bold tnum ${accent ? 'amber-text' : ''}`}>{value}</div>
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
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${
        disabled ? 'cursor-not-allowed bg-[var(--color-panel-2)]' : on ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-panel-2)]'
      }`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
