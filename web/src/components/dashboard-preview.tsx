const IG = '#e1306c';
const NAVER = '#05c75a';
const KAKAO = '#f5b23c';

const series = {
  instagram: [120, 180, 240, 210, 320, 450, 380],
  blog: [40, 60, 85, 75, 120, 180, 150],
  alimtalk: [80, 90, 110, 100, 140, 160, 130],
};
const days = ['월', '화', '수', '목', '금', '토', '일'];

function linePath(vals: number[], w: number, h: number, max: number) {
  const step = w / (vals.length - 1);
  return vals
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (v / max) * h).toFixed(1)}`)
    .join(' ');
}
function areaPath(vals: number[], w: number, h: number, max: number) {
  return `${linePath(vals, w, h, max)} L ${w} ${h} L 0 ${h} Z`;
}

export function DashboardPreview() {
  const W = 460;
  const H = 150;
  const max = 480;

  return (
    <div className="rounded-[14px] bg-[var(--color-panel)]">
      {/* window chrome */}
      <div className="flex items-center justify-between border-b border-[var(--color-hair)] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="mono text-[11px] text-[var(--color-fg-3)]">쿵더쿵 카페 · 이번 주</span>
        </div>
        <span className="mono rounded-md border border-[var(--color-hair)] px-1.5 py-0.5 text-[10px] text-[var(--color-fg-3)]">
          ⌘K
        </span>
      </div>

      <div className="p-4">
        {/* KPI row */}
        <div className="mb-3 grid grid-cols-4 gap-2">
          <Kpi label="총 도달" value="5,150" delta="+12.4%" tone="good" />
          <Kpi label="발행" value="23" delta="+3" tone="good" />
          <Kpi label="평균 별점" value="4.6" delta="-0.1" tone="flat" />
          <Kpi label="답글 대기" value="2" delta="긴급" tone="bad" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* area chart */}
          <div className="col-span-2 rounded-[10px] border border-[var(--color-hair)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="eyebrow">주간 도달 · 채널별</div>
                <div className="mt-1 text-lg font-semibold tnum">1,890</div>
              </div>
              <div className="flex gap-3 text-[10px] text-[var(--color-fg-2)]">
                <Legend c={IG} t="인스타" />
                <Legend c={NAVER} t="블로그" />
                <Legend c={KAKAO} t="알림톡" />
              </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 'auto' }}>
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              ))}
              <path d={areaPath(series.instagram, W, H, max)} fill={IG} opacity="0.1" />
              <path d={linePath(series.instagram, W, H, max)} fill="none" stroke={IG} strokeWidth="2" />
              <path d={linePath(series.blog, W, H, max)} fill="none" stroke={NAVER} strokeWidth="2" />
              <path d={linePath(series.alimtalk, W, H, max)} fill="none" stroke={KAKAO} strokeWidth="2" />
              {series.instagram.map((v, i) => {
                const x = (i * W) / (series.instagram.length - 1);
                const y = H - (v / max) * H;
                return i === 5 ? <circle key={i} cx={x} cy={y} r="3.5" fill={IG} stroke="var(--color-panel)" strokeWidth="2" /> : null;
              })}
            </svg>
            <div className="mono mt-1.5 flex justify-between text-[9px] text-[var(--color-fg-4)]">
              {days.map((d) => <span key={d}>{d}</span>)}
            </div>
          </div>

          {/* donut sentiment */}
          <div className="rounded-[10px] border border-[var(--color-hair)] p-4">
            <div className="eyebrow">리뷰 감정</div>
            <div className="mt-1 text-lg font-semibold tnum">34건</div>
            <div className="mt-3 flex justify-center">
              <Donut />
            </div>
            <div className="mt-3 space-y-1.5 text-[11px]">
              <SentRow c="var(--color-good)" t="긍정" v="68%" />
              <SentRow c="var(--color-fg-3)" t="중립" v="22%" />
              <SentRow c="var(--color-bad)" t="부정" v="10%" />
            </div>
          </div>
        </div>

        {/* bottom: channel bars + activity */}
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="rounded-[10px] border border-[var(--color-hair)] p-4">
            <div className="eyebrow mb-3">채널별 도달</div>
            <Bar label="인스타" v={2840} max={2840} c={IG} />
            <Bar label="블로그" v={1420} max={2840} c={NAVER} />
            <Bar label="알림톡" v={890} max={2840} c={KAKAO} />
          </div>
          <div className="col-span-2 rounded-[10px] border border-[var(--color-hair)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="eyebrow">최근 활동</div>
              <span className="mono flex items-center gap-1 text-[9px] text-[var(--color-good)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-good)]" /> LIVE
              </span>
            </div>
            <div className="space-y-2">
              <Act t="방금" tag="발행" c={IG} txt="인스타 릴스 게시됨" meta="도달 314" />
              <Act t="14분 전" tag="알림" c="#f2597f" txt="리뷰 ★★☆ 감지" meta="답글 준비됨" />
              <Act t="1시간 전" tag="블로그" c={NAVER} txt="오늘 초안 생성 완료" meta="미확인" />
              <Act t="어제" tag="알림톡" c={KAKAO} txt="단골 12명 발송" meta="열람 76%" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, delta, tone }: { label: string; value: string; delta: string; tone: 'good' | 'bad' | 'flat' }) {
  const color = tone === 'good' ? 'var(--color-good)' : tone === 'bad' ? 'var(--color-bad)' : 'var(--color-fg-3)';
  return (
    <div className="rounded-[10px] border border-[var(--color-hair)] p-3">
      <div className="text-[10px] text-[var(--color-fg-3)]">{label}</div>
      <div className="mt-1 text-xl font-semibold tnum">{value}</div>
      <div className="mono mt-0.5 text-[10px]" style={{ color }}>{delta}</div>
    </div>
  );
}

function Legend({ c, t }: { c: string; t: string }) {
  return <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{t}</span>;
}

function Donut() {
  const r = 34;
  const c = 2 * Math.PI * r;
  const segs = [
    { v: 0.68, color: 'var(--color-good)' },
    { v: 0.22, color: 'var(--color-fg-4)' },
    { v: 0.1, color: 'var(--color-bad)' },
  ];
  let offset = 0;
  return (
    <svg width="92" height="92" viewBox="0 0 92 92">
      <g transform="rotate(-90 46 46)">
        {segs.map((s, i) => {
          const dash = s.v * c;
          const el = (
            <circle key={i} cx="46" cy="46" r={r} fill="none" stroke={s.color} strokeWidth="12"
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset} />
          );
          offset += dash;
          return el;
        })}
      </g>
      <text x="46" y="50" textAnchor="middle" className="tnum" fontSize="16" fontWeight="700" fill="var(--color-fg)">68%</text>
    </svg>
  );
}

function SentRow({ c, t, v }: { c: string; t: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-[var(--color-fg-2)]"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{t}</span>
      <span className="tnum text-[var(--color-fg)]">{v}</span>
    </div>
  );
}

function Bar({ label, v, max, c }: { label: string; v: number; max: number; c: string }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex justify-between text-[10px]">
        <span className="text-[var(--color-fg-2)]">{label}</span>
        <span className="tnum text-[var(--color-fg-3)]">{v.toLocaleString()}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
        <div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: c }} />
      </div>
    </div>
  );
}

function Act({ t, tag, c, txt, meta }: { t: string; tag: string; c: string; txt: string; meta: string }) {
  return (
    <div className="grid grid-cols-[54px_54px_1fr_auto] items-center gap-2 text-[11px]">
      <span className="mono text-[9px] text-[var(--color-fg-4)]">{t}</span>
      <span className="w-fit rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ background: `${c}22`, color: c }}>{tag}</span>
      <span className="truncate text-[var(--color-fg)]">{txt}</span>
      <span className="mono text-[9px] text-[var(--color-fg-3)]">{meta}</span>
    </div>
  );
}
