'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
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

// 채널별 붙여넣기 특성 — 캡션형(제목·태그 없음), 태그 필드 유무, 열 앱
const CH_META: Record<string, { caption: boolean; hasTags: boolean; appHref: string; appLabel: string; targetName: string }> = {
  blog: { caption: false, hasTags: true, appHref: 'naverblog://write', appLabel: '네이버 블로그 앱 열기', targetName: '블로그' },
  instagram: { caption: true, hasTags: false, appHref: 'instagram://app', appLabel: '인스타그램 앱 열기', targetName: '인스타그램' },
  threads: { caption: true, hasTags: false, appHref: 'https://www.threads.net', appLabel: '스레드 열기', targetName: '스레드' },
  facebook: { caption: false, hasTags: false, appHref: 'https://www.facebook.com', appLabel: '페이스북 열기', targetName: '페이스북' },
  google_gbp: { caption: false, hasTags: false, appHref: 'https://business.google.com/posts', appLabel: '구글 비즈니스 열기', targetName: '구글 비즈니스' },
};
function metaFor(channel?: string) {
  return CH_META[channel ?? 'blog'] ?? CH_META.blog;
}
// 캡션형(인스타·스레드)=단일 붙여넣기, 태그필드 없으면 태그 스텝 제외
function flowFor(channel?: string): Step[] {
  const m = metaFor(channel);
  if (m.caption) return ['body'];
  return m.hasTags ? ['title', 'body', 'tags'] : ['title', 'body'];
}

const STEP_INFO: Record<Step, { label: string; hint: string; cta: string }> = {
  title: { label: '제목', hint: '블로그 앱에서 제목 칸을 길게 눌러 붙여넣기 하세요.', cta: '다음 · 본문' },
  body: { label: '본문', hint: '본문 칸을 길게 눌러 붙여넣기 하세요.', cta: '다음 · 태그' },
  tags: { label: '태그', hint: '태그 입력칸에 붙여넣기 하세요.', cta: '완료' },
  done: { label: '완료', hint: '이제 앱에서 발행 버튼만 누르면 끝이에요.', cta: '닫기' },
};

function PrepareInner() {
  const params = useSearchParams();
  const postId = params.get('post');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<Step>('title');
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'wait' | 'err'; msg: string }>({
    tone: 'wait',
    msg: '초안을 불러오는 중…',
  });

  // 현재 단계에서 붙여넣을 전체 텍스트
  function contentFor(s: Step, d: Draft | null): string {
    if (!d) return '';
    if (s === 'title') return d.title ?? '';
    if (s === 'body') return d.bodyPlain ?? '';
    if (s === 'tags') return d.tags.map((t) => `#${t}`).join(' ');
    return '';
  }

  async function copyCurrent(s: Step, d: Draft | null) {
    const text = contentFor(s, d);
    if (!text) return;
    await copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  useEffect(() => {
    if (!postId) {
      setStatus({ tone: 'err', msg: '잘못된 접근이에요. 대시보드에서 초안의 [붙여넣기 →]를 다시 눌러주세요.' });
      return;
    }
    fetch(`/api/prepare?post=${encodeURIComponent(postId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(async (d: Draft) => {
        setDraft(d);
        const first = flowFor(d.channel)[0];
        setStep(first);
        await copyCurrent(first, d);
        setStatus({ tone: 'ok', msg: '' });
      })
      .catch((err) => setStatus({ tone: 'err', msg: `초안을 불러오지 못했어요 (${err.message ?? err})` }));
  }, [postId]);

  const flow = flowFor(draft?.channel);
  const isDone = step === 'done';
  const stepIdx = flow.indexOf(step);
  const isLastStep = stepIdx === flow.length - 1;

  async function advance() {
    if (!draft) return;
    if (isDone) {
      window.close(); // 팝업으로 열렸으면 닫힘. 아니면 아래 '대시보드로'가 폴백.
      return;
    }
    if (stepIdx === -1 || isLastStep) {
      setStep('done');
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
    const next = flow[stepIdx + 1];
    setStep(next);
    await copyCurrent(next, draft);
  }

  const info = STEP_INFO[step];
  const meta = metaFor(draft?.channel);
  const stepLabel = meta.caption && step === 'body' ? '캡션' : info.label;
  const hint = meta.caption
    ? isDone
      ? `이제 ${meta.targetName} 앱에서 게시 버튼만 누르면 끝이에요.`
      : `${meta.targetName} 새 게시물 캡션 칸에 길게 눌러 붙여넣기 하세요.`
    : info.hint;
  const ctaLabel = isDone ? '닫기' : isLastStep ? '완료' : info.cta;

  const previewText = contentFor(step, draft);
  const previewClamped = previewText.length > 500 ? previewText.slice(0, 500) + '…' : previewText;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-8 pt-10">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="eyebrow">{draft?.storeName ?? '붙여넣기 도우미'}</span>
        {!isDone && <span className="mono text-[11px] text-[var(--color-fg-3)]">STEP {stepIdx + 1} / {flow.length}</span>}
      </div>

      {/* 진행 세그먼트 */}
      <div className="mt-3 flex gap-1.5">
        {flow.map((s) => {
          const active = isDone || flow.indexOf(s) <= stepIdx;
          return (
            <span key={s} className="h-1 flex-1 rounded-full transition-colors duration-500"
              style={{ background: active ? 'var(--color-amber)' : 'var(--color-hair-strong)' }} />
          );
        })}
      </div>

      {isDone ? (
        /* ── 완료 화면 ── */
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-[var(--color-good)]/12 text-[26px] text-[var(--color-good)]">✓</div>
          <h1 className="mt-5 text-[22px] font-bold tracking-tight">다 붙여넣었어요</h1>
          <p className="mt-2 max-w-[16rem] text-[14px] leading-relaxed text-[var(--color-fg-2)]">{hint}</p>
        </div>
      ) : (
        /* ── 단계 화면 ── */
        <div className="mt-8 flex-1">
          <h1 className="text-[26px] font-bold tracking-tight">{stepLabel}</h1>
          <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--color-fg-2)]">{hint}</p>

          {status.msg && (
            <div className="panel mt-6 flex items-center gap-2.5 rounded-[var(--radius)] p-3.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: status.tone === 'err' ? 'var(--color-bad)' : 'var(--color-fg-3)' }} />
              <span className="text-[13px]" style={{ color: status.tone === 'err' ? 'var(--color-bad)' : 'var(--color-fg-3)' }}>{status.msg}</span>
            </div>
          )}

          {/* 붙여넣을 내용 — 탭하면 다시 복사 (클립보드 유실 대비 핵심 안전장치) */}
          {draft && (
            <button
              type="button"
              onClick={() => copyCurrent(step, draft)}
              className="panel mt-4 block w-full rounded-[var(--radius-lg)] p-4 text-left transition hover:border-[var(--color-hair-strong)]"
            >
              <div className="mb-2 flex items-center gap-2.5">
                <span className="eyebrow" style={{ color: copied ? 'var(--color-good)' : 'var(--color-amber)' }}>
                  {copied ? '복사됨 ✓' : `${stepLabel} 복사됨`}
                </span>
                <span className="h-px flex-1 bg-[var(--color-hair)]" />
                <span className="mono text-[10px] text-[var(--color-fg-4)]">탭하여 다시 복사</span>
              </div>
              <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--color-fg-2)]">
                {previewClamped}
              </p>
            </button>
          )}
        </div>
      )}

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
        {isDone ? (
          <Link href="/dashboard" className="block w-full rounded-full border border-[var(--color-hair-strong)] py-3.5 text-center text-[13.5px] font-medium text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]">
            대시보드로 돌아가기
          </Link>
        ) : (
          <a
            href={meta.appHref}
            className="block w-full rounded-full border border-[var(--color-hair-strong)] py-3.5 text-center text-[13.5px] font-medium text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]"
          >
            {meta.appLabel}
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
