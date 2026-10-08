'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { withJosa } from '@shared/korean';
import { plainTextHtml } from '@shared/post-edit';
import { updatePostDraft } from '@/app/posts/actions';
import { detectExtension, sendDraftToExtension, isOneClickChannel, ONE_CLICK_LABEL, type OneClickChannel } from '@/lib/extension';

type Step = 'title' | 'body' | 'tags' | 'done';

interface Draft {
  status?: string;
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
  // "앱에서 ~하세요"는 이미 앱에 있다는 전제라 어떻게 가는지가 빠진다 → "앱을 열고"로 행동을 유도
  title: { label: '제목', hint: '아래 버튼으로 앱을 열고, 제목 칸을 길게 눌러 붙여넣으세요.', cta: '다음 · 본문' },
  body: { label: '본문', hint: '앱으로 돌아가 본문 칸을 길게 눌러 붙여넣으세요.', cta: '다음 · 태그' },
  tags: { label: '태그', hint: '앱으로 돌아가 태그 입력칸에 붙여넣으세요.', cta: '완료' },
  done: { label: '완료', hint: '이제 앱에서 발행 버튼만 누르면 끝이에요.', cta: '닫기' },
};

function PrepareInner() {
  const params = useSearchParams();
  const postId = params.get('post');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<Step>('title');
  const [copied, setCopied] = useState(false);
  const [publication, setPublication] = useState({ saving: false, confirmed: false, error: '' });
  const [externalUrl, setExternalUrl] = useState('');
  /** 마지막 (자동)복사가 실제로 성공했는지 — 실패면 "탭하여 복사"로 정직하게 안내 */
  const [copyOk, setCopyOk] = useState(false);
  /** 이번 단계에서 앱을 한 번이라도 열었는지 — 열기 전엔 '앱 열기', 다녀온 뒤엔 '다음'을 강조 */
  const [visited, setVisited] = useState(false);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    setDesktop(!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
      !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  }, []);
  const [status, setStatus] = useState<{ tone: 'ok' | 'wait' | 'err'; msg: string }>({
    tone: 'wait',
    msg: '초안을 불러오는 중…',
  });
  /**
   * 확장(네이버 블로그 원클릭) 상태.
   * 있으면 붙여넣기 3단계를 건너뛰고 에디터에 직접 채운다. 없으면 아무것도 안 뜬다.
   */
  const [oneClick, setOneClick] = useState<{ available: boolean; sending: boolean; error: string }>({
    available: false, sending: false, error: '',
  });
  useEffect(() => {
    let alive = true;
    void detectExtension().then((r) => {
      if (alive) setOneClick((s) => ({ ...s, available: r.installed }));
    });
    return () => { alive = false; };
  }, []);

  async function sendToBlog() {
    if (!draft || !isOneClickChannel(draft.channel)) return;
    setOneClick((s) => ({ ...s, sending: true, error: '' }));
    const res = await sendDraftToExtension({
      postId: postId ?? '',
      channel: draft.channel,
      title: draft.title ?? '',
      bodyHtml: draft.bodyHtml ?? draft.bodyPlain ?? '',
      bodyPlain: draft.bodyPlain ?? '',
      tags: draft.tags,
      storeName: draft.storeName,
    });
    setOneClick((s) => ({ ...s, sending: false, error: res.ok ? '' : (res.error ?? '전달 실패') }));
    // 성공하면 확장이 해당 화면을 열고 채운다 — 여기서는 완료 처리만 안내한다
  }

  /** 손보기 — 초안이 마음에 안 들 때 그대로 올리게 두지 않는다(파일럿 첫날 확실히 나올 요구) */
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [editErr, setEditErr] = useState('');

  async function saveEdit() {
    if (!draft || !postId || saving) return;
    const text = editText.trim();
    if (!text) return;
    setSaving(true);
    setEditErr('');
    const patch = step === 'title' ? { title: text } : { bodyPlain: text };
    const res = await updatePostDraft(postId, patch).catch((e: Error) => ({ ok: false, error: e.message }));
    setSaving(false);
    if (!res.ok) {
      setEditErr(res.error ?? '저장하지 못했어요');
      return;
    }
    // 화면·클립보드를 고친 내용으로 즉시 맞춘다 — 저장만 되고 옛 글이 복사되면 최악이다
    const next = step === 'title' ? { ...draft, title: text } : { ...draft, bodyPlain: text, bodyHtml: plainTextHtml(text) };
    setDraft(next);
    setEditing(false);
    await copyCurrent(step, next);
  }

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
    fetch(`/api/prepare?post=${encodeURIComponent(postId)}`, { signal: AbortSignal.timeout(15000) })
      .then((r) => {
        if (r.status === 401) {
          window.location.assign(`/login?next=${encodeURIComponent(`/prepare?post=${postId}`)}`);
        }
        return r.ok ? r.json() : Promise.reject(new Error(String(r.status)));
      })
      .then((d: Draft) => {
        setDraft(d);
        setPublication({ saving: false, confirmed: d.status === 'published', error: '' });
        const first = flowFor(d.channel)[0];
        setStep(first);
        // 로드 완료 = 즉시 상태 클리어. 자동복사는 베스트에포트(제스처 없으면
        // 브라우저가 거부/무한대기할 수 있어 status를 여기에 묶으면 로딩 필이 잔존)
        setStatus({ tone: 'ok', msg: '' });
        void copyCurrent(first, d);
      })
      .catch(() => setStatus({ tone: 'err', msg: '초안을 불러오지 못했어요. 대시보드에서 다시 열어주세요.' }));
  }, [postId]);

  const flow = flowFor(draft?.channel);
  const isDone = step === 'done';
  const stepIdx = flow.indexOf(step);
  const isLastStep = stepIdx === flow.length - 1;

  async function advance() {
    if (!draft || editing || saving || isDone) return;
    if (stepIdx === -1 || isLastStep) {
      setStep('done');
      // 붙여넣기는 준비 단계다. 실제 게시 확인은 별도 버튼으로 저장한다.
      return;
    }
    const next = flow[stepIdx + 1];
    setStep(next);
    setVisited(false); // 새 단계는 다시 '앱 열기'부터 — 단계마다 붙여넣을 칸이 다르다
    await copyCurrent(next, draft);
  }

  const info = STEP_INFO[step];
  const channelMeta = metaFor(draft?.channel);
  const meta = desktop && (draft?.channel ?? 'blog') === 'blog'
    ? { ...channelMeta, appHref: 'https://blog.naver.com/GoBlogWrite.naver', appScheme: undefined, appLabel: '네이버 블로그 글쓰기 열기' }
    : channelMeta;
  const stepLabel = meta.caption && step === 'body' ? '캡션' : info.label;
  const mobileHint = meta.caption
    ? isDone
      ? `이제 ${meta.targetName} 앱에서 게시 버튼만 누르면 끝이에요.`
      : `아래 버튼으로 ${withJosa(meta.targetName, '을를')} 열고, 새 게시물 캡션 칸에 길게 눌러 붙여넣으세요.`
    : info.hint;
  const hint = desktop
    ? isDone
      ? '외부 게시 화면에서 발행 버튼을 눌러주세요.'
      : `글쓰기 화면의 ${stepLabel} 칸을 클릭하고 Ctrl+V(맥은 ⌘+V)로 붙여넣으세요.`
    : mobileHint;
  const ctaLabel = isDone ? '닫기' : isLastStep ? '완료' : info.cta;

  const previewText = contentFor(step, draft);
  const previewClamped = previewText.length > 500 ? previewText.slice(0, 500) + '…' : previewText;

  async function confirmPublication() {
    if (!postId || publication.saving || publication.confirmed) return;
    setPublication({ saving: true, confirmed: false, error: '' });
    try {
      const response = await fetch('/api/prepare', {
        signal: AbortSignal.timeout(15000),
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ post: postId, confirmed: true, externalUrl: externalUrl.trim() }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || '저장하지 못했어요');
      setPublication({ saving: false, confirmed: true, error: '' });
    } catch (error) {
      setPublication({ saving: false, confirmed: false, error: error instanceof Error ? error.message : '저장하지 못했어요' });
    }
  }

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
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight">{publication.confirmed ? '게시 확인을 저장했어요' : '게시 준비가 끝났어요'}</h1>
          <p className="mt-2 max-w-[18rem] text-[14px] leading-relaxed text-[var(--color-fg-2)]">
            {publication.confirmed ? '사장님이 게시를 확인한 기록이에요. 외부 서비스의 자동 검증은 아닙니다.' : `${hint} 게시를 마친 뒤 아래에서 확인해주세요.`}
          </p>
        </div>
      ) : (
        /* ── 단계 화면 ── */
        <div className="mt-8 flex-1">
          <h1 className="text-[26px] font-semibold tracking-tight">{stepLabel}</h1>
          <p className="mt-2.5 text-[14px] leading-relaxed text-[var(--color-fg-2)]">{hint}</p>

          {/* 확장이 깔려 있으면 **붙여넣기를 건너뛴다.** 제목·본문을 에디터에 직접 넣는다.
              (확장이 없으면 이 블록이 아예 안 뜨고 아래 3단계 흐름 그대로 — 설치를 강요하지 않는다) */}
          {oneClick.available && isOneClickChannel(draft?.channel) && (
            <button
              type="button"
              onClick={sendToBlog}
              disabled={oneClick.sending}
              className="btn-primary mt-6 w-full rounded-[var(--radius)] py-3.5 text-[15px] font-medium disabled:opacity-50"
            >
              {oneClick.sending ? '보내는 중…' : `⚡ ${ONE_CLICK_LABEL[draft.channel as OneClickChannel]}`}
            </button>
          )}
          {oneClick.error && (
            <p className="mt-2 text-[12.5px] text-[var(--color-bad)]">
              {oneClick.error} — 아래 순서대로 붙여넣으셔도 됩니다.
            </p>
          )}

          {status.msg && (
            <div className="panel mt-6 flex items-center gap-2.5 rounded-[var(--radius)] p-3.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: status.tone === 'err' ? 'var(--color-bad)' : 'var(--color-fg-3)' }} />
              <span className="text-[13px]" style={{ color: status.tone === 'err' ? 'var(--color-bad)' : 'var(--color-fg-3)' }}>{status.msg}</span>
            </div>
          )}

          {/* 붙여넣을 내용 — 탭하면 다시 복사 (클립보드 유실 대비 핵심 안전장치) */}
          {draft && !editing && (
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

          {/* 손보기 — 마음에 안 드는 글을 그대로 올리게 두지 않는다.
              태그 단계는 목록이라 편집 대상에서 뺀다(제목·본문만). */}
          {draft && editing && (
            <div className="panel mt-4 rounded-[var(--radius-lg)] p-4">
              <div className="mb-2 flex items-center gap-2.5">
                <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>{stepLabel} 고치기</span>
                <span className="h-px flex-1 bg-[var(--color-hair)]" />
              </div>
              <textarea
                aria-label={`${stepLabel} 수정`}
                maxLength={step === 'title' ? 120 : 20000}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={step === 'title' ? 2 : 12}
                className="w-full resize-y rounded-[var(--radius)] border border-[var(--color-hair-strong)] bg-[var(--color-bg)] p-3 text-[13px] leading-relaxed text-[var(--color-fg)] outline-none focus:border-[var(--color-amber)]"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving || !editText.trim()}
                  className="btn-primary flex-1 rounded-full py-2.5 text-[14px] font-medium disabled:opacity-40"
                >
                  {saving ? '저장 중…' : '저장하고 복사'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                    disabled={saving}
                  className="rounded-full border border-[var(--color-hair-strong)] px-5 text-[14px] text-[var(--color-fg-2)]"
                >
                  취소
                </button>
              </div>
              {editErr && <p className="mt-2 text-[12.5px] text-[var(--color-bad)]">{editErr}</p>}
            </div>
          )}

          {draft && !editing && step !== 'tags' && (
            <button
              type="button"
              onClick={() => {
                setEditErr('');
                setEditText(step === 'title' ? (draft.title ?? '') : (draft.bodyPlain ?? ''));
                setEditing(true);
              }}
              className="mt-2 w-full rounded-full border border-[var(--color-hair)] py-2 text-[12.5px] text-[var(--color-fg-3)] transition hover:text-[var(--color-fg)]"
            >
              마음에 안 들면 · 고쳐서 쓰기
            </button>
          )}
        </div>
      )}

      {/* 하단 CTA
          실제 순서는 [복사] → [앱 열기] → 앱에서 붙여넣기 → 돌아와서 [다음]인데,
          예전엔 [다음]이 주 버튼이고 앱 열기가 보조라 **먼저 눌러야 할 게 아래 흐리게** 있었다.
          제품을 만든 사람도 이 버튼이 뭔지 몰랐을 만큼 순서가 안 보였다(실측 피드백).
          → 앱에 다녀왔는지(visited)에 따라 강조를 넘긴다. */}
      {isDone ? (
        <div className="mt-8 space-y-2.5">
          {!publication.confirmed && (
            <>
              <a href={meta.appHref} target="_blank" rel="noopener noreferrer" className="block py-2 text-center text-[14px] text-[var(--color-amber)]">{meta.appLabel}</a>
              <label htmlFor="published-url" className="block text-[13px] text-[var(--color-fg-2)]">게시물 주소 · 선택</label>
              <input id="published-url" type="url" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)}
                placeholder="https://…" className="w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3 text-[14px]" />
              <button type="button" onClick={confirmPublication} disabled={publication.saving}
                className="btn-primary w-full rounded-full py-3.5 text-[14px] font-medium disabled:opacity-50">
                {publication.saving ? '저장하는 중…' : `외부 ${desktop ? '화면' : '앱'}에서 게시했어요 · 확인 저장`}
              </button>
            </>
          )}
          {publication.error && <p role="alert" className="text-[13px] text-[var(--color-bad)]">{publication.error}</p>}
          <Link href="/dashboard" className="btn-primary block w-full rounded-full py-3.5 text-center text-[14px] font-medium">
            대시보드로 돌아가기
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-2.5">
          <a
            href={meta.appHref}
            target={desktop ? '_blank' : undefined}
            rel={desktop ? 'noopener noreferrer' : undefined}
            onClick={(e) => {
              setVisited(true);
              if (!meta.appScheme) return; // https만 있는 채널은 기본 동작(앱 있으면 OS가 앱으로 연다)
              e.preventDefault();
              openAppWithFallback(meta.appScheme, meta.appHref);
            }}
            className={
              visited
                ? 'block w-full rounded-full border border-[var(--color-hair-strong)] py-3.5 text-center text-[13.5px] font-medium text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)]'
                : 'block w-full rounded-full bg-[var(--color-amber)] py-3.5 text-center text-[14px] font-medium text-[var(--color-amber-ink)] transition hover:brightness-105'
            }
          >
            {visited ? `${meta.appLabel} (다시)` : `1. ${meta.appLabel}`}
          </a>
          <button
            type="button"
            onClick={advance}
            disabled={!draft || editing || saving}
            className={
              visited
                ? 'w-full rounded-full bg-[var(--color-amber)] py-3.5 text-[14px] font-medium text-[var(--color-amber-ink)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40'
                : 'w-full rounded-full border border-[var(--color-hair-strong)] py-3.5 text-[13.5px] font-medium text-[var(--color-fg-2)] transition hover:text-[var(--color-fg)] disabled:cursor-not-allowed disabled:opacity-40'
            }
          >
            2. 붙여넣었어요 · {ctaLabel.replace(/^다음 · /, '')}
          </button>
        </div>
      )}
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
