'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Step = 'title' | 'body' | 'tags' | 'done';

interface Draft {
  title: string;
  bodyHtml: string;
  bodyPlain: string;
  tags: string[];
  storeName: string;
  channel?: string;
}

const FLOW: Step[] = ['title', 'body', 'tags'];
// 인스타는 제목이 없고(캡션 단일) 해시태그도 캡션에 포함 → 캡션 한 단계만
function flowFor(channel?: string): Step[] {
  return channel === 'instagram' ? ['body'] : FLOW;
}

const STEP_INFO: Record<Step, { idx: number; label: string; hint: string; cta: string }> = {
  title: { idx: 1, label: '제목', hint: '블로그 앱에서 제목 칸을 길게 눌러 붙여넣기 하세요.', cta: '다음 · 본문' },
  body: { idx: 2, label: '본문', hint: '본문 첫 문단을 길게 눌러 붙여넣기 하세요.', cta: '다음 · 태그' },
  tags: { idx: 3, label: '태그', hint: '태그 입력칸에 붙여넣기 하세요.', cta: '완료' },
  done: { idx: 4, label: '완료', hint: '이제 블로그 앱에서 발행 버튼만 누르면 끝이에요.', cta: '닫기' },
};

function PrepareInner() {
  const params = useSearchParams();
  const postId = params.get('post');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<Step>('title');
  const [status, setStatus] = useState<{ tone: 'ok' | 'wait' | 'err'; msg: string }>({
    tone: 'wait',
    msg: '초안을 불러오는 중…',
  });

  useEffect(() => {
    if (!postId) {
      setStatus({ tone: 'err', msg: '잘못된 접근이에요. 대시보드에서 초안의 [붙여넣기 →]를 다시 눌러주세요.' });
      return;
    }
    fetch(`/api/prepare?post=${encodeURIComponent(postId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(async (d: Draft) => {
        setDraft(d);
        // 인스타(캡션 단일)는 body부터 시작 — null 제목 복사 방지
        if (flowFor(d.channel)[0] === 'body') {
          setStep('body');
          await copyToClipboard(d.bodyPlain);
          setStatus({ tone: 'ok', msg: '캡션이 복사됐어요. 인스타에 붙여넣기 하세요.' });
        } else {
          await copyToClipboard(d.title);
          setStatus({ tone: 'ok', msg: '제목이 복사됐어요. 붙여넣기 하세요.' });
        }
      })
      .catch((err) => setStatus({ tone: 'err', msg: `초안을 불러오지 못했어요 (${err.message ?? err})` }));
  }, [postId]);

  const flow = flowFor(draft?.channel);

  async function advance() {
    if (!draft) return;
    if (step === 'done') {
      window.close();
      return;
    }
    const i = flow.indexOf(step);
    if (i === -1 || i >= flow.length - 1) {
      setStep('done');
      setStatus({ tone: 'ok', msg: '' });
      // 발행 완료 마킹 → 브리핑에서 이 초안이 빠짐(멱등, 실패해도 UX 막지 않음)
      if (postId && postId !== 'MOCK') {
        fetch('/api/prepare', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ post: postId }),
        }).catch(() => {});
      }
      return;
    }
    const next = flow[i + 1];
    if (next === 'body') {
      await copyToClipboard(draft.bodyPlain);
      setStatus({ tone: 'ok', msg: '본문이 복사됐어요.' });
    } else if (next === 'tags') {
      await copyToClipboard(draft.tags.map((t) => `#${t}`).join(' '));
      setStatus({ tone: 'ok', msg: '태그가 복사됐어요.' });
    }
    setStep(next);
  }

  const info = STEP_INFO[step];
  const isDone = step === 'done';
  const isLastStep = flow.indexOf(step) === flow.length - 1;
  const ctaLabel = isDone ? STEP_INFO.done.cta : isLastStep ? '완료' : info.cta;
  const preview =
    step === 'title'
      ? draft?.title
      : step === 'body'
        ? (draft?.bodyPlain ?? '').slice(0, 420) + ((draft?.bodyPlain?.length ?? 0) > 420 ? '…' : '')
        : step === 'tags'
          ? draft?.tags.map((t) => `#${t}`).join(' ')
          : '';

  const toneColor =
    status.tone === 'ok' ? 'var(--color-good)' : status.tone === 'err' ? 'var(--color-bad)' : 'var(--color-fg-3)';

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-8 pt-10">
      {/* 헤더: 매장명 + 단계 */}
      <div className="flex items-center justify-between">
        <span className="eyebrow">{draft?.storeName ?? '블로그 발행'}</span>
        {!isDone && <span className="mono text-[11px] text-[var(--color-fg-3)]">STEP {flow.indexOf(step) + 1} / {flow.length}</span>}
      </div>

      {/* 진행 세그먼트 */}
      <div className="mt-3 flex gap-1.5">
        {flow.map((s) => {
          const active = isDone || flow.indexOf(s) <= flow.indexOf(step);
          return (
            <span
              key={s}
              className="h-1 flex-1 rounded-full transition-colors duration-500"
              style={{ background: active ? 'var(--color-amber)' : 'var(--color-hair-strong)' }}
            />
          );
        })}
      </div>

      {/* 본문 */}
      <div className="mt-9 flex-1">
        {isDone ? (
          <div className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-good)] text-[16px] text-[var(--color-good)]">
            ✓
          </div>
        ) : null}
        <h1 className="mt-4 text-[26px] font-bold tracking-tight">
          {draft?.channel === 'instagram' && step === 'body' ? '캡션' : info.label}
        </h1>
        <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--color-fg-2)]">
          {draft?.channel === 'instagram'
            ? isDone
              ? '이제 인스타그램 앱에서 게시 버튼만 누르면 끝이에요.'
              : '인스타그램 새 게시물 캡션 칸에 길게 눌러 붙여넣기 하세요.'
            : info.hint}
        </p>

        {/* 상태 */}
        {status.msg && (
          <div className="panel mt-6 flex items-center gap-2.5 rounded-[var(--radius)] p-3.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: toneColor }} />
            <span className="text-[13px]" style={{ color: toneColor }}>
              {status.msg}
            </span>
          </div>
        )}

        {/* 붙여넣을 내용 미리보기 */}
        {draft && !isDone && (
          <div className="panel mt-3 rounded-[var(--radius-lg)] p-4">
            <div className="mb-2 flex items-center gap-2.5">
              <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>클립보드</span>
              <span className="h-px flex-1 bg-[var(--color-hair)]" />
              <span className="text-[10px] text-[var(--color-fg-4)]">길게 눌러 붙여넣기</span>
            </div>
            <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-fg-2)]">
              {preview}
            </p>
          </div>
        )}
      </div>

      {/* 하단 CTA */}
      <div className="mt-8 space-y-2.5">
        <button
          type="button"
          onClick={advance}
          disabled={!draft && !isDone}
          className="w-full rounded-full bg-[var(--color-amber)] py-3.5 text-[14px] font-semibold text-[var(--color-amber-ink)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ctaLabel}
        </button>
        {!isDone && (
          <a
            href={draft?.channel === 'instagram' ? 'instagram://app' : 'naverblog://write'}
            className="block w-full rounded-full border border-[var(--color-hair-strong)] py-3.5 text-center text-[13.5px] font-medium text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]"
          >
            {draft?.channel === 'instagram' ? '인스타그램 앱 열기' : '네이버 블로그 앱 열기'}
          </a>
        )}
      </div>
    </main>
  );
}

export default function PreparePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-md px-5 pt-10 text-[13px] text-[var(--color-fg-3)]">불러오는 중…</main>}>
      <PrepareInner />
    </Suspense>
  );
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}
