'use client';

import { useMemo, useState, useTransition } from 'react';
import { completeOnboarding } from '@/app/onboarding/actions';
import { CHANNELS, AUTOMATION_LABEL, GROUPS, type ChannelId, type ChannelGroup } from '@shared/channels/registry';
import {
  BIZ_GROUPS,
  businessTypesByGroup,
  resolveBusinessType,
  recommendedChannelsFor,
  marketingFocusFor,
  type BizGroup,
} from '@shared/business/taxonomy';
import { offeringNoun } from '@shared/content-engine/offerings';
import type { StoreOffering } from '@shared/content-engine/types';

const GROUP_ORDER: ChannelGroup[] = ['acquire', 'sell', 'retain'];
const BIZ_GROUP_ORDER: BizGroup[] = [
  'food', 'retail', 'beauty', 'health', 'medical', 'education', 'lifestyle', 'professional', 'hospitality',
];

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [storeName, setStoreName] = useState('');
  const [industryId, setIndustryId] = useState('');
  const [offerings, setOfferings] = useState<StoreOffering[]>([{ name: '' }, { name: '' }, { name: '' }]);
  const [placeUrl, setPlaceUrl] = useState('');
  const [channels, setChannels] = useState<Set<ChannelId>>(new Set());
  const [channelsTouched, setChannelsTouched] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  const biz = industryId ? resolveBusinessType(industryId) : null;
  const offeringWord = biz ? offeringNoun(biz.offering) : '메뉴';

  function setOffering(i: number, patch: Partial<StoreOffering>) {
    setOfferings((prev) => prev.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  }
  function addOffering() {
    setOfferings((prev) => [...prev, { name: '' }]);
  }

  // 선택된 사업에 맞는 추천 채널(연결 가능한 것만). 사용자가 직접 건드리기 전까진 이걸 프리필.
  const recommended = useMemo<ChannelId[]>(() => {
    if (!biz) return [];
    const connectable = new Set(CHANNELS.filter((c) => c.status !== 'planned').map((c) => c.id));
    return recommendedChannelsFor(biz).filter((id) => connectable.has(id));
  }, [biz]);

  const effectiveChannels = channelsTouched ? channels : new Set(recommended);

  const steps = ['매장', '업종', offeringWord, '플레이스', '채널'];
  const canNext = [storeName.trim().length > 0, industryId !== '', true, true, true][step];
  const lastStep = steps.length - 1;

  function toggleChannel(id: ChannelId) {
    setChannelsTouched(true);
    setChannels((prev) => {
      const base = channelsTouched ? prev : new Set(recommended);
      const n = new Set(base);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function finish() {
    setError('');
    start(async () => {
      const res = await completeOnboarding({
        storeName: storeName.trim(),
        industryId,
        naverPlaceUrl: placeUrl.trim() || undefined,
        channels: [...effectiveChannels],
        offerings: offerings
          .map((o) => ({ name: o.name.trim(), price: o.price }))
          .filter((o) => o.name),
      });
      if (!res.ok) setError(res.error ?? '문제가 발생했습니다');
    });
  }

  return (
    <div className="w-full max-w-lg">
      {/* progress */}
      <div className="mb-8 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i <= step ? 'bg-[var(--color-amber)] text-[var(--color-amber-ink)]' : 'bg-[var(--color-panel-2)] text-[var(--color-fg-4)]'}`}>{i + 1}</div>
            {i < steps.length - 1 && <div className={`h-px flex-1 ${i < step ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-hair)]'}`} />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Step title="매장 이름이 뭔가요?" desc="블로그·인스타에 노출될 상호입니다.">
          <input autoFocus value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="예: 쿵더쿵 카페"
            className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3.5 text-[15px] outline-none focus:border-[var(--color-amber)]" />
        </Step>
      )}

      {step === 1 && (
        <Step title="어떤 사업이세요?" desc="업종에 맞춰 콘텐츠 톤과 채널을 자동으로 구성해드려요.">
          <div className="max-h-[46vh] space-y-5 overflow-y-auto pr-1">
            {BIZ_GROUP_ORDER.map((g) => (
              <div key={g}>
                <div className="eyebrow mb-2">{BIZ_GROUPS[g].label}</div>
                <div className="flex flex-wrap gap-2">
                  {businessTypesByGroup(g).map((b) => {
                    const on = industryId === b.id;
                    return (
                      <button key={b.id} onClick={() => setIndustryId(b.id)}
                        className={`rounded-full border px-3 py-1.5 text-[12.5px] transition ${on ? 'border-[var(--color-amber)] bg-[var(--color-amber)] font-semibold text-[var(--color-amber-ink)]' : 'border-[var(--color-hair-strong)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'}`}>
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {biz && (
            <p className="mt-4 text-[13px] text-[var(--color-fg-3)]">
              <span className="text-[var(--color-amber)]">{biz.label}</span> — {marketingFocusFor(biz)} 마케팅으로 맞춰드릴게요.
            </p>
          )}
        </Step>
      )}

      {step === 2 && (
        <Step title={`어떤 ${offeringWord}${offeringWord === '메뉴' ? '를' : '을'} 파세요?`} desc={`두세 개만 적어두면 첫 글부터 실제 이름·가격이 들어가요. 건너뛰어도 괜찮아요.`}>
          <div className="space-y-2">
            {offerings.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={o.name} onChange={(e) => setOffering(i, { name: e.target.value })} placeholder={`${offeringWord} 이름`}
                  className="min-w-0 flex-1 rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[13.5px] outline-none focus:border-[var(--color-amber)]" />
                <input value={o.price ?? ''} inputMode="numeric"
                  onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); setOffering(i, { price: n ? Number(n) : undefined }); }} placeholder="가격"
                  className="w-20 shrink-0 rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-2.5 py-2.5 text-right text-[13.5px] tabular-nums outline-none focus:border-[var(--color-amber)]" />
              </div>
            ))}
            <button type="button" onClick={addOffering}
              className="mono w-full rounded-xl border border-dashed border-[var(--color-hair-strong)] py-2.5 text-[12px] text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]">
              + {offeringWord} 추가
            </button>
          </div>
          <p className="mt-2 text-[12px] text-[var(--color-fg-3)]">비워두면 매장 정보로 알아서 써드려요. 나중에 설정에서 더 추가할 수 있어요.</p>
        </Step>
      )}

      {step === 3 && (
        <Step title="네이버 플레이스 주소" desc="붙여넣으면 매장 정보·메뉴·리뷰 톤을 자동으로 학습해요. (선택)">
          <input value={placeUrl} onChange={(e) => setPlaceUrl(e.target.value)} placeholder="https://map.naver.com/p/..."
            className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3.5 text-[14px] outline-none focus:border-[var(--color-amber)]" />
          <p className="mt-2 text-[12px] text-[var(--color-fg-3)]">나중에 대시보드에서 추가해도 됩니다.</p>
        </Step>
      )}

      {step === 4 && (
        <Step title="이 채널로 시작할게요" desc={biz ? `${biz.label}에 맞는 채널을 골라뒀어요. 원하면 바꿀 수 있어요.` : '추천 채널을 골라뒀어요.'}>
          <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
            {GROUP_ORDER.map((g) => {
              const chans = CHANNELS.filter((c) => c.group === g && c.status !== 'planned');
              if (!chans.length) return null;
              return (
                <div key={g}>
                  <div className="mb-2 text-[12px] font-semibold text-[var(--color-fg-2)]">{GROUPS[g].label} · <span className="font-normal text-[var(--color-fg-3)]">{GROUPS[g].desc}</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    {chans.map((c) => {
                      const on = effectiveChannels.has(c.id);
                      const rec = recommended.includes(c.id);
                      const au = AUTOMATION_LABEL[c.automation];
                      return (
                        <button key={c.id} onClick={() => toggleChannel(c.id)}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${on ? 'border-[var(--color-amber)] bg-[var(--color-panel)]' : 'border-[var(--color-hair)]'}`}>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                            <span className="text-[13px]">{c.name}</span>
                            {rec && !on && <span className="mono text-[9px] text-[var(--color-amber)]">추천</span>}
                          </span>
                          <span className="mono text-[9px]" style={{ color: on ? 'var(--color-amber)' : au.color }}>{on ? '✓' : au.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Step>
      )}

      {error && <p className="mt-4 text-[13px] text-[var(--color-bad)]">{error}</p>}

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button onClick={() => setStep((s) => s - 1)} className="rounded-full border border-[var(--color-hair-strong)] px-5 py-2.5 text-[14px] text-[var(--color-fg-2)]">이전</button>
        )}
        {step < lastStep ? (
          <button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="btn-primary flex-1 rounded-full py-2.5 text-[14px] font-semibold disabled:opacity-40">다음</button>
        ) : (
          <button onClick={finish} disabled={pending} className="btn-primary flex-1 rounded-full py-2.5 text-[14px] font-semibold disabled:opacity-60">
            {pending ? '설정 중…' : `${effectiveChannels.size}개 채널로 시작하기`}
          </button>
        )}
      </div>
    </div>
  );
}

function Step({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="h2">{title}</h1>
      <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">{desc}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}
