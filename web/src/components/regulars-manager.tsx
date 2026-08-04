'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { tierByDays, isReactivationTarget, draftReactivation, type RegularTier } from '@shared/content-engine/reactivation';
import { addRegular, deleteRegular } from '@/app/regulars/actions';
import { AppHeader } from '@/components/app-header';

export interface RegularRow {
  id: string;
  name: string | null;
  phone: string;
  lastVisitAt: string | null;
  visitCount: number;
  daysSince: number | null;
}

const TIER: Record<RegularTier, { label: string; color: string }> = {
  active: { label: '활성', color: 'var(--color-good)' },
  fading: { label: '뜸해짐', color: 'var(--color-amber)' },
  inactive: { label: '끊김', color: 'var(--color-bad)' },
  unknown: { label: '방문일 미상', color: 'var(--color-fg-3)' },
};

function fmtPhone(p: string) {
  const d = p.replace(/[^0-9]/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p;
}
function agoLabel(days: number | null) {
  if (days == null) return '방문 기록 없음';
  if (days === 0) return '오늘 방문';
  if (days < 30) return `${days}일 전 방문`;
  const m = Math.floor(days / 30);
  return `${m}개월 전 방문`;
}

export function RegularsManager({ storeName, regulars }: { storeName: string; regulars: RegularRow[] }) {
  const [list, setList] = useState(regulars);
  const [benefit, setBenefit] = useState('');
  const [filter, setFilter] = useState<'targets' | 'all'>('targets');
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  const targets = useMemo(() => list.filter((r) => isReactivationTarget(r.daysSince)), [list]);
  const shown = filter === 'targets' ? targets : list;

  // 표시 상한 — 단골이 수백 명이면 카드를 전부 렌더해 모바일이 스크롤 지옥이 된다
  // (실측: 300명 매장에서 카드 212개 동시 렌더). 하루에 수백 명에게 보내지 않으므로
  // 우선순위 높은(오래 안 온) 순으로 끊어 보여주고 필요할 때만 늘린다.
  const PAGE = 40;
  const [visible, setVisible] = useState(PAGE);
  const page = shown.slice(0, visible);
  const restCount = Math.max(0, shown.length - page.length);
  // 필터를 바꾸면 다시 처음부터
  const prevFilter = useRef(filter);
  if (prevFilter.current !== filter) {
    prevFilter.current = filter;
    if (visible !== PAGE) setVisible(PAGE);
  }

  function onAdded(row: RegularRow) {
    setList((prev) => [row, ...prev]);
  }
  function onDelete(id: string) {
    const prev = list;
    setList((p) => p.filter((r) => r.id !== id));
    start(async () => {
      const res = await deleteRegular(id);
      if (res.error) {
        setErr(res.error);
        setList(prev);
      }
    });
  }

  return (
    <div className="min-h-screen">
      <AppHeader storeName={storeName} current="/regulars" width="4xl" />

      <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6">
        <div className="eyebrow">재방문 유도</div>
        <h1 className="h1 mt-2">단골 관리</h1>
        <p className="mt-2 text-[14px] text-[var(--color-fg-2)]">
          한동안 안 오신 단골에게 재방문 메시지를 준비해요. 알림톡 연동 후 한 번에 보낼 수 있어요.
        </p>

        {/* 요약 — 대시보드/리뷰와 동일한 헤어라인 KPI 타일 */}
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Metric label="전체 단골" value={list.length} />
          <Metric label="활성" value={list.filter((r) => tierByDays(r.daysSince) === 'active').length} accent="var(--color-good)" />
          <Metric label="재방문 대상" value={targets.length} accent={targets.length > 0 ? 'var(--color-amber)' : undefined} />
          <Metric label="끊긴 단골" value={list.filter((r) => tierByDays(r.daysSince) === 'inactive').length} accent="var(--color-bad)" />
        </div>

        {/* 단골 추가 + 혜택 */}
        <AddForm onAdded={onAdded} />

        <div className="mt-4">
          <label className="eyebrow">재방문 혜택 문구 (선택)</label>
          <input
            value={benefit}
            onChange={(e) => setBenefit(e.target.value)}
            placeholder="예: 아메리카노 1잔 무료"
            className="mt-1.5 w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-2.5 text-[13.5px] outline-none focus:border-[var(--color-amber)]"
          />
          <p className="mt-1.5 text-[11px] text-[var(--color-fg-3)]">넣으면 아래 메시지에 자동 반영돼요.</p>
        </div>

        {err && <p className="mt-3 text-[13px] text-[var(--color-bad)]">{err}</p>}

        {/* 필터 */}
        <div className="mt-6 flex gap-1.5">
          {(['targets', 'all'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-2 text-[12.5px] font-medium transition ${filter === f ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'border border-[var(--color-hair)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'}`}>
              {f === 'targets' ? '재방문 대상' : '전체'} <span className="mono opacity-70">{f === 'targets' ? targets.length : list.length}</span>
            </button>
          ))}
        </div>

        {/* 목록 */}
        <div className="mt-4">
          {shown.length === 0 ? (
            <div className="panel rounded-[var(--radius-lg)] p-10 text-center">
              <p className="text-[14px] text-[var(--color-fg-2)]">
                {list.length === 0 ? '아직 등록된 단골이 없어요. 위에서 추가해보세요.' : '재방문 유도 대상이 없어요. 단골 관리가 잘 되고 있네요.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {page.map((r) => (
                <RegularCard key={r.id} r={r} storeName={storeName} benefit={benefit} onDelete={() => onDelete(r.id)} disabled={pending} />
              ))}
            </div>
          )}
          {restCount > 0 && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE)}
                className="rounded-full border border-[var(--color-hair-strong)] px-5 py-2.5 text-[13px] font-medium text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]"
              >
                {restCount.toLocaleString()}명 더 보기
              </button>
              <p className="mt-2 text-[12px] text-[var(--color-fg-3)]">오래 안 오신 분부터 보여드리고 있어요.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="panel min-w-0 rounded-[var(--radius)] p-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: accent ?? 'var(--color-fg)' }}>{value.toLocaleString()}</span>
        <span className="text-[12px] text-[var(--color-fg-3)]">명</span>
      </div>
    </div>
  );
}

/**
 * 문자 앱 딥링크 — 번호·내용까지 채워서 연다(알림톡 연동 전에도 1탭 발송).
 * body 구분자가 iOS는 '&', 그 외(Android)는 '?' — 문자앱이 body를 무시하는 기기 대비로
 * 클릭 시 클립보드 복사도 병행한다.
 */
function smsHref(phone: string, body: string): string {
  const p = phone.replace(/[^0-9+]/g, '');
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return `sms:${p}${isIOS ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

function RegularCard({ r, storeName, benefit, onDelete, disabled }: { r: RegularRow; storeName: string; benefit: string; onDelete: () => void; disabled: boolean }) {
  const [copied, setCopied] = useState(false);
  const tier = tierByDays(r.daysSince);
  const t = TIER[tier];
  const isTarget = isReactivationTarget(r.daysSince);
  const draft = isTarget ? draftReactivation({ name: r.name, storeName, daysSince: r.daysSince, benefit, nowMs: Date.now() }) : '';

  async function copy() {
    try { await navigator.clipboard.writeText(draft); } catch { /* noop */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="panel rounded-[var(--radius-lg)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${t.color}1c`, color: t.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />{t.label}
          </span>
          <span className="text-[13.5px] font-medium">{r.name || '이름 미상'}</span>
          <span className="mono text-[11px] text-[var(--color-fg-3)]">{fmtPhone(r.phone)}</span>
        </div>
        <button type="button" onClick={onDelete} disabled={disabled} className="text-[11px] text-[var(--color-fg-4)] transition hover:text-[var(--color-bad)] disabled:opacity-40">삭제</button>
      </div>
      <div className="mono mt-1.5 text-[10.5px] text-[var(--color-fg-3)]">{agoLabel(r.daysSince)} · 누적 {r.visitCount}회</div>

      {isTarget && (
        <div className="mt-3 rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-panel-2)] p-3">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>재방문 메시지</span>
            <span className="h-px flex-1 bg-[var(--color-hair)]" />
            <span className="text-[10px] text-[var(--color-fg-4)]">확인 후 발송</span>
          </div>
          <p className="text-[13px] leading-relaxed text-[var(--color-fg-2)]">{draft}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {/* 주 동선: 문자 앱을 번호·내용까지 채워 열기 (복사 병행 — body 미지원 기기 폴백) */}
            <a
              href={smsHref(r.phone, draft)}
              onClick={() => void copy()}
              className="rounded-lg bg-[var(--color-amber)] px-3.5 py-2 text-[12px] font-medium text-[var(--color-amber-ink)] transition hover:opacity-90"
            >
              문자로 보내기
            </a>
            <button type="button" onClick={copy} className="rounded-lg border border-[var(--color-hair-strong)] px-3.5 py-2 text-[12px] font-medium text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]">
              {copied ? '✓ 복사됨' : '복사만'}
            </button>
            <button type="button" disabled title="알림톡 연동 후 사용" className="cursor-not-allowed rounded-lg border border-[var(--color-hair)] px-3.5 py-2 text-[12px] font-medium text-[var(--color-fg-4)]">
              알림톡 발송 (연동 후)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddForm({ onAdded }: { onAdded: (r: RegularRow) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [lastVisit, setLastVisit] = useState('');
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  function submit() {
    setErr('');
    start(async () => {
      const res = await addRegular({ name, phone, lastVisit: lastVisit || undefined });
      if (res.error) { setErr(res.error); return; }
      const days = lastVisit ? Math.max(0, Math.floor((Date.now() - Date.parse(`${lastVisit}T00:00:00+09:00`)) / 86_400_000)) : null;
      onAdded({ id: `tmp-${phone}-${name}`, name: name || null, phone: phone.replace(/[^0-9]/g, ''), lastVisitAt: lastVisit || null, visitCount: 0, daysSince: days });
      setName(''); setPhone(''); setLastVisit('');
    });
  }

  return (
    <div className="panel mt-6 rounded-[var(--radius-lg)] p-4">
      <div className="eyebrow mb-3">단골 추가</div>
      <div className="grid gap-2.5 sm:grid-cols-[1fr_1.2fr_1fr_auto]">
        {/* aria-label 필수 — placeholder는 입력을 시작하면 사라지고, type=date는 아예 표시되지 않는다
            (axe critical: Form elements must have labels) */}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" aria-label="단골 이름"
          className="rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[13.5px] outline-none focus:border-[var(--color-amber)]" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="전화번호 (010...)" aria-label="단골 전화번호"
          className="rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[13.5px] outline-none focus:border-[var(--color-amber)]" />
        <input value={lastVisit} onChange={(e) => setLastVisit(e.target.value)} type="date" aria-label="마지막 방문일"
          className="rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-fg-2)] outline-none focus:border-[var(--color-amber)]" />
        <button type="button" onClick={submit} disabled={pending || phone.trim().length === 0}
          className="btn-primary rounded-xl px-5 py-2.5 text-[13.5px] font-medium disabled:opacity-40">
          {pending ? '추가 중…' : '추가'}
        </button>
      </div>
      {err && <p className="mt-2.5 text-[12.5px] text-[var(--color-bad)]">{err}</p>}
    </div>
  );
}
