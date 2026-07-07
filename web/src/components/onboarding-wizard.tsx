'use client';

import { useState, useTransition } from 'react';
import { completeOnboarding } from '@/app/onboarding/actions';
import { CHANNELS, AUTOMATION_LABEL, GROUPS, type ChannelId, type ChannelGroup } from '@shared/channels/registry';

const INDUSTRIES = [
  { id: 'cafe', label: '카페·베이커리', emoji: '☕' },
  { id: 'restaurant', label: '음식점', emoji: '🍽️' },
  { id: 'vet', label: '동물병원', emoji: '🐾' },
  { id: 'beauty', label: '미용실·네일샵', emoji: '💇' },
  { id: 'gym', label: '헬스·PT', emoji: '💪' },
  { id: 'kids', label: '학원·키즈', emoji: '📚' },
];

const GROUP_ORDER: ChannelGroup[] = ['acquire', 'sell', 'retain'];
const RECOMMENDED: ChannelId[] = ['naver_place', 'naver_blog', 'instagram', 'kakao_alimtalk'];

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [storeName, setStoreName] = useState('');
  const [industryId, setIndustryId] = useState('');
  const [placeUrl, setPlaceUrl] = useState('');
  const [channels, setChannels] = useState<Set<ChannelId>>(() => new Set(RECOMMENDED));
  const [pending, start] = useTransition();
  const [error, setError] = useState('');

  const steps = ['매장', '업종', '플레이스', '채널'];
  const canNext = [storeName.trim().length > 0, industryId !== '', true, true][step];

  function finish() {
    setError('');
    start(async () => {
      const res = await completeOnboarding({
        storeName: storeName.trim(),
        industryId,
        naverPlaceUrl: placeUrl.trim() || undefined,
        channels: [...channels],
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
        <Step title="어떤 업종이세요?" desc="업종에 맞는 콘텐츠 톤을 자동으로 잡아드려요.">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {INDUSTRIES.map((ind) => (
              <button key={ind.id} onClick={() => setIndustryId(ind.id)}
                className={`rounded-xl border p-3 text-center transition ${industryId === ind.id ? 'border-[var(--color-amber)] bg-[var(--color-panel)]' : 'border-[var(--color-hair)] hover:border-[var(--color-hair-strong)]'}`}>
                <div className="text-[22px]">{ind.emoji}</div>
                <div className="mt-1 text-[12px]">{ind.label}</div>
              </button>
            ))}
          </div>
        </Step>
      )}

      {step === 2 && (
        <Step title="네이버 플레이스 주소" desc="붙여넣으면 매장 정보·메뉴·리뷰 톤을 자동으로 학습해요. (선택)">
          <input value={placeUrl} onChange={(e) => setPlaceUrl(e.target.value)} placeholder="https://map.naver.com/p/..."
            className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3.5 text-[14px] outline-none focus:border-[var(--color-amber)]" />
          <p className="mt-2 text-[12px] text-[var(--color-fg-3)]">나중에 대시보드에서 추가해도 됩니다.</p>
        </Step>
      )}

      {step === 3 && (
        <Step title="어떤 채널을 켤까요?" desc="추천 채널을 골라뒀어요. 나중에 연결센터에서 바꿀 수 있어요.">
          <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
            {GROUP_ORDER.map((g) => (
              <div key={g}>
                <div className="mb-2 text-[12px] font-semibold text-[var(--color-fg-2)]">{GROUPS[g].label} · <span className="font-normal text-[var(--color-fg-3)]">{GROUPS[g].desc}</span></div>
                <div className="grid grid-cols-2 gap-2">
                  {CHANNELS.filter((c) => c.group === g && c.status !== 'planned').map((c) => {
                    const on = channels.has(c.id);
                    const au = AUTOMATION_LABEL[c.automation];
                    return (
                      <button key={c.id} onClick={() => setChannels((p) => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${on ? 'border-[var(--color-amber)] bg-[var(--color-panel)]' : 'border-[var(--color-hair)]'}`}>
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                          <span className="text-[13px]">{c.name}</span>
                        </span>
                        <span className="mono text-[9px]" style={{ color: au.color }}>{on ? '✓' : au.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Step>
      )}

      {error && <p className="mt-4 text-[13px] text-[var(--color-bad)]">{error}</p>}

      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button onClick={() => setStep((s) => s - 1)} className="rounded-full border border-[var(--color-hair-strong)] px-5 py-2.5 text-[14px] text-[var(--color-fg-2)]">이전</button>
        )}
        {step < 3 ? (
          <button onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="btn-primary flex-1 rounded-full py-2.5 text-[14px] font-semibold disabled:opacity-40">다음</button>
        ) : (
          <button onClick={finish} disabled={pending} className="btn-primary flex-1 rounded-full py-2.5 text-[14px] font-semibold disabled:opacity-60">
            {pending ? '설정 중…' : `${channels.size}개 채널로 시작하기`}
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
