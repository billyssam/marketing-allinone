'use client';

import { useState, useTransition } from 'react';
import { updateStore } from '@/app/settings/actions';
import { BIZ_GROUPS, businessTypesByGroup, resolveBusinessType, type BizGroup } from '@shared/business/taxonomy';
import type { StoreOffering } from '@shared/content-engine/types';

const BIZ_GROUP_ORDER: BizGroup[] = [
  'food', 'retail', 'beauty', 'health', 'medical', 'education', 'lifestyle', 'professional', 'hospitality',
];

// offering 종류별 UI 문구 — 사장님 업종에 맞게 "메뉴/상품/시술/프로그램"
const OFFERING_UI: Record<string, { label: string; hint: string; ph: string }> = {
  menu: { label: '메뉴', hint: '글에 실제 메뉴·가격이 그대로 들어가요', ph: '예: 수제대추차' },
  product: { label: '상품', hint: '글에 실제 상품·가격이 그대로 들어가요', ph: '예: 린넨 셔츠' },
  service: { label: '서비스·시술', hint: '글에 실제 서비스·가격이 그대로 들어가요', ph: '예: 전신 왁싱' },
  booking: { label: '프로그램·서비스', hint: '글에 실제 프로그램·가격이 그대로 들어가요', ph: '예: 1:1 PT 10회' },
};

export interface StoreForm {
  name: string;
  industryId: string;
  naverPlaceUrl: string;
  naverBlogUrl: string;
  address: string;
  offerings: StoreOffering[];
}

export function SettingsForm({ store }: { store: StoreForm }) {
  const [f, setF] = useState<StoreForm>(store);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof StoreForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setSaved(false);
  };

  const offeringUi = OFFERING_UI[resolveBusinessType(f.industryId).offering];

  function setOffering(i: number, patch: Partial<StoreOffering>) {
    setF((p) => ({ ...p, offerings: p.offerings.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
    setSaved(false);
  }
  function addOffering() {
    setF((p) => ({ ...p, offerings: [...p.offerings, { name: '' }] }));
    setSaved(false);
  }
  function removeOffering(i: number) {
    setF((p) => ({ ...p, offerings: p.offerings.filter((_, j) => j !== i) }));
    setSaved(false);
  }

  function save() {
    setErr('');
    start(async () => {
      const res = await updateStore({
        name: f.name,
        industryId: f.industryId,
        naverPlaceUrl: f.naverPlaceUrl || undefined,
        naverBlogUrl: f.naverBlogUrl || undefined,
        address: f.address || undefined,
        offerings: f.offerings,
      });
      if (res.error) setErr(res.error);
      else setSaved(true);
    });
  }

  const inputCls =
    'w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3 text-[14px] outline-none transition focus:border-[var(--color-amber)]';

  return (
    <div className="mt-8 space-y-6">
      <Field label="매장 이름" hint="블로그·인스타에 노출될 상호">
        <input value={f.name} onChange={set('name')} className={inputCls} placeholder="예: 쿵더쿵 카페" />
      </Field>

      <Field label="업종" hint="콘텐츠 톤·추천 채널에 반영돼요">
        <div className="max-h-[40vh] space-y-4 overflow-y-auto rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] p-3">
          {BIZ_GROUP_ORDER.map((g) => (
            <div key={g}>
              <div className="eyebrow mb-2">{BIZ_GROUPS[g].label}</div>
              <div className="flex flex-wrap gap-2">
                {businessTypesByGroup(g).map((b) => {
                  const on = f.industryId === b.id;
                  return (
                    <button key={b.id} type="button" onClick={() => { setF((p) => ({ ...p, industryId: b.id })); setSaved(false); }}
                      className={`rounded-full border px-3 py-1.5 text-[12.5px] transition ${on ? 'border-[var(--color-amber)] bg-[var(--color-amber)] font-semibold text-[var(--color-amber-ink)]' : 'border-[var(--color-hair-strong)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'}`}>
                      {b.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {f.industryId && (
          <p className="mt-2 text-[12px] text-[var(--color-fg-3)]">선택: <span className="text-[var(--color-amber)]">{resolveBusinessType(f.industryId).label}</span></p>
        )}
      </Field>

      <Field label="네이버 플레이스 주소" hint="리뷰 자동 수집·콘텐츠 학습에 사용돼요 (권장)">
        <input value={f.naverPlaceUrl} onChange={set('naverPlaceUrl')} className={inputCls} placeholder="https://map.naver.com/p/…/place/1565864790" />
      </Field>

      <Field label="네이버 블로그 주소" hint="블로그 발행 대상 (선택)">
        <input value={f.naverBlogUrl} onChange={set('naverBlogUrl')} className={inputCls} placeholder="https://blog.naver.com/…" />
      </Field>

      <Field label="주소" hint="글에 정확한 위치로 삽입돼요 (선택)">
        <input value={f.address} onChange={set('address')} className={inputCls} placeholder="예: 충북 옥천군 안내면 …" />
      </Field>

      {/* 판매 항목 — 업종별 라벨(메뉴/상품/시술/프로그램). 콘텐츠 엔진이 이 실제 값으로 글을 씀 */}
      <Field label={offeringUi.label} hint={offeringUi.hint}>
        <div className="space-y-2">
          {f.offerings.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--color-hair-strong)] px-4 py-3 text-[13px] text-[var(--color-fg-3)]">
              아직 등록된 {offeringUi.label}이 없어요. 추가하면 글에 실제 이름·가격이 들어갑니다.
            </p>
          )}
          {f.offerings.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={o.name} onChange={(e) => setOffering(i, { name: e.target.value })} placeholder={offeringUi.ph}
                className="min-w-0 flex-1 rounded-lg border border-[var(--color-hair)] bg-[var(--color-panel)] px-3 py-2.5 text-[13.5px] outline-none focus:border-[var(--color-amber)]" />
              <input value={o.price ?? ''} inputMode="numeric" onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); setOffering(i, { price: n ? Number(n) : undefined }); }} placeholder="가격"
                className="w-20 shrink-0 rounded-lg border border-[var(--color-hair)] bg-[var(--color-panel)] px-2.5 py-2.5 text-right text-[13.5px] tabular-nums outline-none focus:border-[var(--color-amber)]" />
              <button type="button" onClick={() => removeOffering(i)} aria-label="삭제"
                className="shrink-0 rounded-lg border border-[var(--color-hair)] px-2.5 py-2.5 text-[13px] text-[var(--color-fg-4)] transition hover:text-[var(--color-bad)]">✕</button>
            </div>
          ))}
          <button type="button" onClick={addOffering}
            className="mono w-full rounded-lg border border-dashed border-[var(--color-hair-strong)] py-2.5 text-[12px] text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]">
            + {offeringUi.label} 추가
          </button>
        </div>
      </Field>

      {err && <p className="text-[13px] text-[var(--color-bad)]">{err}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button type="button" onClick={save} disabled={pending} className="btn-primary rounded-full px-6 py-3 text-[14px] font-semibold disabled:opacity-60">
          {pending ? '저장 중…' : '저장'}
        </button>
        {saved && !pending && <span className="text-[13px] text-[var(--color-good)]">저장됐어요.</span>}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <label className="text-[13px] font-semibold">{label}</label>
        {hint && <span className="text-[11px] text-[var(--color-fg-3)]">{hint}</span>}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
