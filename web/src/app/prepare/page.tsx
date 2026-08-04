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
/**
 * appHref = 실제 이동 주소(항상 https — JS가 죽어도 최소한 웹은 열린다).
 * appScheme = 앱이 설치돼 있으면 먼저 시도할 커스텀 스킴.
 *   커스텀 스킴만 두면 앱 미설치·인앱 브라우저 차단 시 **아무 일도 안 일어나** 사장님이 막힌다.
 */
const CH_META: Record<string, { caption: boolean; hasTags: boolean; appHref: string; appScheme?: string; appLabel: string; targetName: string }> = {
  blog: { caption: false, hasTags: true, appHref: 'https://m.blog.naver.com', appScheme: 'naverblog://write', appLabel: '네이버 블로그 앱 열기', targetName: '블로그' },
  instagram: { caption: true, hasTags: false, appHref: 'https://www.instagram.com', appScheme: 'instagram://app', appLabel: '인스타그램 앱 열기', targetName: '인스타그램' },
  threads: { caption: true, hasTags: false, appHref: 'https://www.threads.net', appLabel: '스레드 열기', targetName: '스레드' },
  facebook: { caption: true, hasTags: false, appHref: 'https://www.facebook.com', appLabel: '페이스북 열기', targetName: '페이스북' },
  google_gbp: { caption: true, hasTags: false, appHref: 'https://business.google.com/posts', appLabel: '구글 비즈니스 열기', targetName: '구글 비즈니스' },
  // 플레이스 '소식'·당근 '동네홍보'·밴드·카카오채널 — 모두 제목 없는 단일 텍스트 입력
  naver_place: { caption: true, hasTags: false, appHref: 'https://new.smartplace.naver.com/', appLabel: '스마트플레이스 열기', targetName: '플레이스 소식' },
  danggeun: { caption: true, hasTags: false, appHref: 'https://www.daangn.com/', appLabel: '당근 열기', targetName: '당근 동네홍보' },
  naver_band: { caption: true, hasTags: false, appHref: 'https://band.us/', appLabel: '밴드 열기', targetName: '밴드' },
  kakao_channel: { caption: true, hasTags: false, appHref: 'https://center-pf.kakao.com/', appLabel: '카카오 채널 관리자 열기', targetName: '카카오 채널' },
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
  /** 마지막 (자동)복사가 실제로 성공했는지 — 실패면 "탭하여 복사"로 정직하게 안내 */
  const [copyOk, setCopyOk] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'wait' | 'err'; msg: string }>({
    tone: 'wait',
    msg: '초안을 불러오는 중…',
  });

  // 현재 단계에서 붙여넣을 전체 텍스트
  function contentFor(s: Step, d: Draft | null): string {
    if (!d) return '';
    if (s === 'title') return d.title ?? '';
    if (s === 'body') {
      // 단일 필드 채널(페북·구글)이고 제목이 따로 있으면 제목+본문 한 번에 붙이기
      const m = metaFor(d.channel);
      if (m.caption && d.title) return `${d.title}\n\n${d.bodyPlain ?? ''}`;
      return d.bodyPlain ?? '';
    }
    if (s === 'tags') return d.tags.map((t) => `#${t}`).join(' ');
    return '';
  }

  async function copyCurrent(s: Step, d: Draft | null) {
    const text = contentFor(s, d);
    if (!text) return;
    const ok = await copyToClipboard(text);
    setCopyOk(ok);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }

  useEffect(() => {
    if (!postId) {
      setStatus({ tone: 'err', msg: '잘못된 접근이에요. 대시보드에서 초안의 [붙여넣기 →]를 다시 눌러주세요.' });
      return;
    }
    fetch(`/api/prepare?post=${encodeURIComponent(postId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Draft) => {
        setDraft(d);
        const first = flowFor(d.channel)[0];
        setStep(first);
        // 로드 완료 = 즉시 상태 클리어. 자동복사는 베스트에포트(제스처 없으면
        // 브라우저가 거부/무한대기할 수 있어 status를 여기에 묶으면 로딩 필이 잔존)
        setStatus({ tone: 'ok', msg: '' });
        void copyCurrent(first, d);
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
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight">다 붙여넣었어요</h1>
          <p className="mt-2 max-w-[16rem] text-[14px] leading-relaxed text-[var(--color-fg-2)]">{hint}</p>
        </div>
      ) : (
        /* ── 단계 화면 ── */
        <div className="mt-8 flex-1">
          <h1 className="text-[26px] font-semibold tracking-tight">{stepLabel}</h1>
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
                  {copied ? '복사됨 ✓' : copyOk ? `${stepLabel} 복사됨` : `${stepLabel} · 탭하여 복사`}
                </span>
                <span className="h-px flex-1 bg-[var(--color-hair)]" />
                {/* 미복사 상태에선 좌측 라벨이 이미 '탭하여 복사'라 중복 문구 숨김 */}
                {copyOk && <span className="mono text-[10px] text-[var(--color-fg-4)]">탭하여 다시 복사</span>}
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
          className="w-full rounded-full bg-[var(--color-amber)] py-3.5 text-[14px] font-medium text-[var(--color-amber-ink)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
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
            onClick={(e) => {
              if (!meta.appScheme) return; // https만 있는 채널은 기본 동작(앱 있으면 OS가 앱으로 연다)
              e.preventDefault();
              openAppWithFallback(meta.appScheme, meta.appHref);
            }}
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

/**
 * 앱 스킴을 먼저 시도하고, 앱이 열리지 않으면 웹으로 폴백.
 * 앱이 실제로 열리면 페이지가 백그라운드로 가면서 visibilitychange가 발생 → 폴백 취소.
 * (앱 미설치·인앱 브라우저 스킴 차단 시 "눌렀는데 아무 일도 없음"을 막는 게 목적)
 */
function openAppWithFallback(scheme: string, webUrl: string) {
  let left = false;
  const onHide = () => {
    left = true;
  };
  document.addEventListener('visibilitychange', onHide, { once: true });
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide);
    if (!left && !document.hidden) window.location.href = webUrl;
  }, 1200);
  window.location.href = scheme;
}

/** 성공 여부를 돌려준다 — 제스처 없는 자동복사는 모바일에서 흔히 거부되므로 UI가 정직해야 함 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
