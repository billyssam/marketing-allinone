'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const LENGTHS: { v: 'short' | 'medium' | 'long'; l: string }[] = [
  { v: 'short', l: '짧게' },
  { v: 'medium', l: '보통' },
  { v: 'long', l: '길게' },
];

const TARGETS: { v: 'blog' | 'blog_insta'; l: string }[] = [
  { v: 'blog', l: '블로그' },
  { v: 'blog_insta', l: '블로그 + 인스타' },
];

export interface ComposerAngle {
  key: string;
  label: string;
  directive: string;
}

/**
 * 업종별 주제 예시 — 사장님이 매일 보는 자리라 남의 업종 예시가 떠 있으면 안 된다.
 * (카페 예시 "신메뉴 대추라떼 출시"가 미용실·헬스장 사장님에게도 그대로 보이고 있었다)
 */
const TOPIC_EXAMPLE: Record<string, string> = {
  메뉴: '신메뉴 대추라떼 출시',
  상품: '여름 신상 입고 소식',
  시술: '이달의 추천 시술',
  프로그램: '여름 단기 프로그램 오픈',
};

/** 오늘 글 컴포저 — 각도·주제·길이·채널 선택 → /api/generate → posts 저장 → 새로고침 */
export function GenerateButton({
  angles = [],
  offeringWord = '메뉴',
}: {
  angles?: ComposerAngle[];
  /** 업종별 판매 항목 명사(메뉴/상품/시술/프로그램) — 예시 문구를 맞춘다 */
  offeringWord?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [angle, setAngle] = useState('');
  const [pickedAngle, setPickedAngle] = useState<string>(''); // 선택된 각도 key
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [target, setTarget] = useState<'blog' | 'blog_insta'>('blog');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      // 직접 입력한 주제 우선 → 없으면 선택한 각도 지시문 → 없으면 자동(매장 정보 기반)
      const picked = angles.find((a) => a.key === pickedAngle);
      const angleValue = angle.trim() || picked?.directive || undefined;
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          angle: angleValue,
          targetLength: length,
          channels: target === 'blog_insta' ? ['naver_blog', 'instagram'] : ['naver_blog'],
        }),
      });
      if (!res.ok) {
        // 서버가 보낸 한국어 안내(일일 상한 등)를 우선 표시 — 고정 문구로 덮지 않는다
        let serverMsg: string | null = null;
        try {
          const data = await res.json();
          if (data?.error) serverMsg = data.error;
        } catch {
          /* 비-JSON 에러 바디 */
        }
        if (res.status === 429) {
          throw new Error(serverMsg ?? 'Gemini 무료 한도를 다 썼어요. 결제를 연결하면 계속 만들 수 있어요.');
        }
        if (res.status === 503) {
          throw new Error(serverMsg ?? '아직 AI 키가 연결되지 않았어요. 설정에서 Gemini를 연결해주세요.');
        }
        throw new Error(serverMsg ?? '생성에 실패했어요. 잠시 후 다시 시도해주세요.');
      }
      setOpen(false);
      setAngle('');
      setPickedAngle('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setError(null); }}
        className="btn-primary rounded-full px-5 py-2.5 text-[13px] font-medium"
      >
        오늘 글 생성
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => !loading && setOpen(false)} />
          <div className="panel absolute right-0 z-50 mt-2 w-[288px] rounded-[var(--radius-lg)] p-4 shadow-2xl">
            <div className="eyebrow">오늘 뭘 알릴까요?</div>

            {/* 각도 칩 — 업종별 오늘의 방향을 탭 한 번으로(직접 입력도 가능) */}
            {angles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {angles.map((a) => {
                  const on = pickedAngle === a.key;
                  return (
                    <button
                      key={a.key}
                      type="button"
                      title={a.directive}
                      onClick={() => setPickedAngle(on ? '' : a.key)}
                      className={`rounded-full border px-2.5 py-1 text-[11.5px] transition ${on ? 'border-[var(--color-amber)] bg-[var(--color-amber)] font-medium text-[var(--color-amber-ink)]' : 'border-[var(--color-hair-strong)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'}`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            )}

            <input
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) generate(); }}
              placeholder={`직접 주제 쓰기 (예: ${TOPIC_EXAMPLE[offeringWord] ?? TOPIC_EXAMPLE['메뉴']})`}
              className="mt-2 w-full rounded-xl border border-[var(--color-hair)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[13.5px] outline-none focus:border-[var(--color-amber)]"
            />
            <p className="mt-1.5 text-[11px] text-[var(--color-fg-3)]">
              {angle.trim() ? '직접 쓴 주제로 만들어요.' : pickedAngle ? '선택한 각도로 만들어요.' : '비우면 매장 정보로 알아서 써드려요.'}
            </p>

            <div className="mt-3 flex gap-1.5">
              {LENGTHS.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setLength(o.v)}
                  className={`flex-1 rounded-lg py-2 text-[12px] font-medium transition ${length === o.v ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'border border-[var(--color-hair)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'}`}
                >
                  {o.l}
                </button>
              ))}
            </div>

            <div className="mt-2 flex gap-1.5">
              {TARGETS.map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setTarget(o.v)}
                  className={`flex-1 rounded-lg py-2 text-[12px] font-medium transition ${target === o.v ? 'bg-[var(--color-fg)] text-[var(--color-bg)]' : 'border border-[var(--color-hair)] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]'}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {target === 'blog_insta' && (
              <p className="mt-1.5 text-[10.5px] text-[var(--color-fg-4)]">인스타 캡션·해시태그까지 인스타 말투로 함께 만들어요.</p>
            )}

            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="btn-primary mt-3 w-full rounded-full py-2.5 text-[13px] font-medium disabled:opacity-60"
            >
              {loading ? '생성 중… (10~20초)' : '생성하기'}
            </button>

            {error && <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--color-bad)]">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
