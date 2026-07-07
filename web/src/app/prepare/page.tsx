'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type Step = 'title' | 'body' | 'tags' | 'done';

interface Draft {
  title: string;
  bodyHtml: string;
  bodyPlain: string;
  tags: string[];
  storeName: string;
}

const STEP_INFO: Record<Step, { label: string; hint: string; buttonLabel: string }> = {
  title: {
    label: '1/3 · 제목',
    hint: '네이버 블로그 앱에서 제목 자리를 길게 눌러 붙여넣기 하세요.',
    buttonLabel: '다음: 본문 준비',
  },
  body: {
    label: '2/3 · 본문',
    hint: '본문 첫 문단을 길게 눌러 붙여넣기 하세요.',
    buttonLabel: '다음: 태그 준비',
  },
  tags: {
    label: '3/3 · 태그',
    hint: '태그 입력창에 붙여넣기 하세요.',
    buttonLabel: '완료',
  },
  done: {
    label: '🎉 완료',
    hint: '이제 네이버 블로그 앱에서 발행 버튼만 누르세요.',
    buttonLabel: '닫기',
  },
};

export default function PreparePage() {
  const params = useSearchParams();
  const postId = params.get('post');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<Step>('title');
  const [status, setStatus] = useState<string>('불러오는 중…');

  useEffect(() => {
    if (!postId) {
      setStatus('❌ 잘못된 접근이에요. 카톡의 [보내기]를 다시 눌러주세요.');
      return;
    }

    fetch(`/api/prepare?post=${encodeURIComponent(postId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Draft) => {
        setDraft(d);
        return copyToClipboard(d.title);
      })
      .then(() => setStatus('✅ 제목이 클립보드에 있어요. 붙여넣기 하세요.'))
      .catch((err) => setStatus(`❌ 초안 로드 실패: ${err.message ?? err}`));
  }, [postId]);

  async function advance() {
    if (!draft) return;
    if (step === 'title') {
      await copyToClipboard(draft.bodyPlain);
      setStep('body');
      setStatus('✅ 본문이 클립보드에 있어요.');
    } else if (step === 'body') {
      await copyToClipboard(draft.tags.map((t) => `#${t}`).join(' '));
      setStep('tags');
      setStatus('✅ 태그가 클립보드에 있어요.');
    } else if (step === 'tags') {
      setStep('done');
      setStatus('');
    } else {
      window.close();
    }
  }

  const info = STEP_INFO[step];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-between px-6 py-10">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[#6d7cff]">
          {draft?.storeName ?? '초안 준비'}
        </div>
        <h1 className="mt-2 text-2xl font-bold">{info.label}</h1>
        <p className="mt-4 text-sm text-[#a0a0a8]">{info.hint}</p>

        <div className="mt-6 rounded-lg border border-white/8 bg-white/2 p-4 text-sm">
          {status}
        </div>

        {draft && step !== 'done' && (
          <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-white/8 bg-black/40 p-4 text-xs text-[#a0a0a8]">
            {step === 'title' && draft.title}
            {step === 'body' && draft.bodyPlain.slice(0, 400) + '…'}
            {step === 'tags' && draft.tags.map((t) => `#${t}`).join(' ')}
          </div>
        )}
      </div>

      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={advance}
          disabled={!draft && step !== 'done'}
          className="w-full rounded-lg bg-[#6d7cff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7d8cff] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {info.buttonLabel}
        </button>

        {step !== 'done' && (
          <a
            href="naverblog://write"
            className="block w-full rounded-lg border border-white/12 bg-white/2 px-4 py-3 text-center text-sm font-medium text-[#eaeaea] transition hover:bg-white/6"
          >
            네이버 블로그 앱 열기
          </a>
        )}
      </div>
    </main>
  );
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback (구형 브라우저)
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
