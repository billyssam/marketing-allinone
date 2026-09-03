'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { completeOnboarding } from '@/app/onboarding/actions';
import { CHANNELS, automationLabelFor, GROUPS, type ChannelId, type ChannelGroup } from '@shared/channels/registry';
import {
  BIZ_GROUPS,
  businessTypesByGroup,
  resolveBusinessType,
  recommendedChannelsFor,
  marketingFocusFor,
  hasPlacePage,
  type BizGroup,
} from '@shared/business/taxonomy';
import { offeringNoun } from '@shared/content-engine/offerings';
import { withJosa } from '@shared/korean';
import type { StoreOffering } from '@shared/content-engine/types';

const GROUP_ORDER: ChannelGroup[] = ['acquire', 'sell', 'retain'];
const BIZ_GROUP_ORDER: BizGroup[] = [
  'food', 'retail', 'beauty', 'health', 'medical', 'education', 'lifestyle', 'professional', 'hospitality',
];

// 온보딩 중간 이탈·새로고침 방어 — 입력을 localStorage에 자동 저장/복원.
// (업종·메뉴까지 채우다 새로고침하면 처음부터 = 명백한 이탈 리스크)
const DRAFT_KEY = 'maio_onboarding_draft_v1';
interface OnboardingDraft {
  step: number;
  storeName: string;
  industryId: string;
  offerings: StoreOffering[];
  placeUrl: string;
  channels: ChannelId[];
  channelsTouched: boolean;
}

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
  const [restored, setRestored] = useState(false);

  // 마운트 시 저장된 초안 복원 (SSR hydration 안전 — useEffect에서만 접근)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<OnboardingDraft>;
        if (d.storeName) setStoreName(d.storeName);
        if (d.industryId) setIndustryId(d.industryId);
        if (Array.isArray(d.offerings) && d.offerings.length) setOfferings(d.offerings);
        if (d.placeUrl) setPlaceUrl(d.placeUrl);
        if (d.channelsTouched && Array.isArray(d.channels)) {
          setChannels(new Set(d.channels));
          setChannelsTouched(true);
        }
        // 최대 5단계. 업종이 플레이스를 못 가지면 4단계가 되는데, 복원 시점엔 업종이 아직
        // state에 안 들어가 있다 → 넉넉히 클램프하고, 렌더에서 `current`가 다시 막는다.
        if (typeof d.step === 'number') setStep(Math.min(Math.max(d.step, 0), 4));
        setRestored(Boolean(d.storeName || d.industryId));
      }
    } catch {
      /* 손상된 초안은 무시 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 입력 변경 시 자동 저장 (첫 렌더 복원 전에는 저장하지 않음 — 빈 값으로 덮어쓰기 방지)
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      return;
    }
    try {
      // 실질 입력이 하나도 없으면 저장 대신 삭제(리셋 후 빈 초안 잔존 방지)
      const isEmpty =
        !storeName && !industryId && !placeUrl && offerings.every((o) => !o.name) && !channelsTouched;
      if (isEmpty) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      const draft: OnboardingDraft = {
        step, storeName, industryId, offerings, placeUrl,
        channels: [...channels], channelsTouched,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* 용량 초과 등 무시 */
    }
  }, [step, storeName, industryId, offerings, placeUrl, channels, channelsTouched]);

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

  /**
   * 단계를 **번호가 아니라 이름으로** 다룬다.
   *
   * 왜: 플레이스 단계는 업종에 따라 없어야 한다(온라인 셀러·프리랜서·과외는 네이버 플레이스를
   * 가질 수 없다). 실제로 온라인 셀러 사장님이 **있지도 않은 플레이스 주소를 요구받았다**
   * (2026-09-03 실사용자 계정에서 실측). 그런데 렌더·검증·네비게이션이 전부 `step === 3` 처럼
   * 숫자에 묶여 있어, 단계를 하나 빼면 나머지가 조용히 한 칸씩 밀린다.
   * 키로 바꾸면 목록에서 빼는 것만으로 안전하게 사라진다.
   */
  const canHavePlace = !biz || hasPlacePage(biz);
  const stepKeys = ['store', 'industry', 'offering', ...(canHavePlace ? ['place'] as const : []), 'channels'] as const;
  type StepKey = (typeof stepKeys)[number];
  // 업종을 바꾸면 단계 수가 줄 수 있다(5→4). 그때 step이 범위를 넘으면
  // `stepKeys[step]`이 undefined가 되어 **첫 화면으로 튄다** — 클램프해서 막는다.
  const current = stepKeys[Math.min(step, stepKeys.length - 1)] as StepKey;
  const STEP_LABEL: Record<StepKey, string> = {
    store: '매장', industry: '업종', offering: offeringWord, place: '플레이스', channels: '채널',
  };
  const steps = stepKeys.map((k) => STEP_LABEL[k]);
  const canNext: Record<StepKey, boolean> = {
    store: storeName.trim().length > 0, industry: industryId !== '', offering: true, place: true, channels: true,
  };
  const lastStep = stepKeys.length - 1;
  // 진행 표시(●②③④)도 step을 그대로 쓰므로 state 자체를 범위 안으로 되돌려 놓는다
  useEffect(() => {
    if (step > lastStep) setStep(lastStep);
  }, [step, lastStep]);

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
    // 낙관적 정리 — 성공 시 서버가 redirect를 throw해 아래 else에 도달하지 못하므로
    // 여기서 먼저 지운다. finish는 저장 트리거(state)를 건드리지 않아 재저장되지 않음.
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
    start(async () => {
      const res = await completeOnboarding({
        storeName: storeName.trim(),
        industryId,
        // 업종을 바꿔 플레이스 단계가 사라졌다면, 그 전에 입력된 주소는 보내지 않는다
        // (화면에 없는 값이 조용히 저장되면 그 매장은 영영 안 되는 크롤을 매일 시도한다)
        naverPlaceUrl: canHavePlace ? placeUrl.trim() || undefined : undefined,
        channels: [...effectiveChannels],
        offerings: offerings
          .map((o) => ({ name: o.name.trim(), price: o.price }))
          .filter((o) => o.name),
      });
      if (!res.ok) {
        setError(res.error ?? '문제가 발생했습니다');
        // 실패 → 새로고침해도 복원되도록 초안 재저장
        try {
          localStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({ step, storeName, industryId, offerings, placeUrl, channels: [...channels], channelsTouched }),
          );
        } catch { /* noop */ }
      }
    });
  }

  return (
    <div className="w-full max-w-lg">
      {/* progress */}
      <div className="mb-8 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${i <= step ? 'bg-[var(--color-amber)] text-[var(--color-amber-ink)]' : 'bg-[var(--color-panel-2)] text-[var(--color-fg-4)]'}`}>{i + 1}</div>
            {i < steps.length - 1 && <div className={`h-px flex-1 ${i < step ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-hair)]'}`} />}
          </div>
        ))}
      </div>

      {restored && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-[var(--color-hair)] bg-[var(--color-panel)] px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-[12.5px] text-[var(--color-fg-2)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-good)]" />
            입력하던 내용을 이어서 진행할 수 있어요.
          </span>
          <button
            type="button"
            onClick={() => {
              try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
              setStoreName(''); setIndustryId('');
              setOfferings([{ name: '' }, { name: '' }, { name: '' }]);
              setPlaceUrl(''); setChannels(new Set()); setChannelsTouched(false);
              setStep(0); setRestored(false);
            }}
            className="mono shrink-0 text-[11px] text-[var(--color-fg-3)] transition hover:text-[var(--color-fg)]"
          >
            처음부터
          </button>
        </div>
      )}

      {current === 'store' && (
        <Step title="매장 이름이 뭔가요?" desc="블로그·인스타에 노출될 상호입니다.">
          <input autoFocus value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="예: 쿵더쿵 카페"
            className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3.5 text-[15px] outline-none focus:border-[var(--color-amber)]" />
        </Step>
      )}

      {current === 'industry' && (
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
                        className={`rounded-full border px-3 py-1.5 text-[12.5px] transition ${on ? 'border-[var(--color-amber)] bg-[var(--color-amber)] font-medium text-[var(--color-amber-ink)]' : 'border-[var(--color-hair-strong)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'}`}>
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

      {current === 'offering' && (
        <Step title={`어떤 ${withJosa(offeringWord, '을를')} 파세요?`} desc={`두세 개만 적어두면 첫 글부터 실제 이름·가격이 들어가요. 건너뛰어도 괜찮아요.`}>
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

      {/* desc의 "메뉴"를 못박으면 미용실·헬스장 사장님에겐 남의 서비스처럼 읽힌다 */}
      {current === 'place' && (
        <Step title="네이버 플레이스 주소" desc={`붙여넣으면 매장 정보·${offeringWord}·리뷰 톤을 자동으로 학습해요. (선택)`}>
          <input value={placeUrl} onChange={(e) => setPlaceUrl(e.target.value)} placeholder="https://map.naver.com/p/..."
            className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3.5 text-[14px] outline-none focus:border-[var(--color-amber)]" />
          <p className="mt-2 text-[12px] text-[var(--color-fg-3)]">나중에 대시보드에서 추가해도 됩니다.</p>
        </Step>
      )}

      {current === 'channels' && (
        <Step title="이 채널로 시작할게요" desc={biz ? `${biz.label}에 맞는 채널을 골라뒀어요. 원하면 바꿀 수 있어요.` : '추천 채널을 골라뒀어요.'}>
          <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
            {GROUP_ORDER.map((g) => {
              const chans = CHANNELS.filter((c) => c.group === g && c.status !== 'planned');
              if (!chans.length) return null;
              return (
                <div key={g}>
                  <div className="mb-2 text-[12px] font-medium text-[var(--color-fg-2)]">{GROUPS[g].label} · <span className="font-normal text-[var(--color-fg-3)]">{GROUPS[g].desc}</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    {chans.map((c) => {
                      const on = effectiveChannels.has(c.id);
                      const rec = recommended.includes(c.id);
                      const au = automationLabelFor(c);
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
          <button onClick={() => setStep((s) => s + 1)} disabled={!canNext[current]} className="btn-primary flex-1 rounded-full py-2.5 text-[14px] font-medium disabled:opacity-40">다음</button>
        ) : (
          <button onClick={finish} disabled={pending} className="btn-primary flex-1 rounded-full py-2.5 text-[14px] font-medium disabled:opacity-60">
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
