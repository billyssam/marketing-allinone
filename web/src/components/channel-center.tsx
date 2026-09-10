'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { AppHeader } from '@/components/app-header';
import { toggleChannel } from '@/app/channels/actions';
import { saveChannelKey } from '@/app/channels/actions';
import { detectExtension } from '@/lib/extension';
import {
  canVerifyKey,
  KEY_CHANNELS,
  OAUTH_CHANNELS,
  READINESS_LABEL,
  READINESS_ORDER,
  WAITING_REASON,
  type Readiness,
} from '@shared/channels/readiness';
import type { ChannelId } from '@shared/channels/registry';

export interface ChannelRow {
  id: ChannelId;
  name: string;
  color: string;
  readiness: Readiness;
  connected: boolean;
  /** 키가 실제로 저장돼 있는가 — "연결됨"과 다르다(연결만 켜고 키가 없을 수 있다) */
  hasKey: boolean;
  made: number;
  posted: number;
  /** 이 채널로 글이 만들어지는가 — 아니면 실적 칸을 비운다(0으로 속이지 않게) */
  writesContent: boolean;
}

export function ChannelCenter({
  storeName,
  rows,
  recommended,
  bizLabel,
}: {
  storeName: string;
  rows: ChannelRow[];
  recommended: string[];
  bizLabel: string;
}) {
  const [list, setList] = useState(rows);
  const [busy, setBusy] = useState<ChannelId | null>(null);
  const [openKey, setOpenKey] = useState<ChannelId | null>(null);
  const [extInstalled, setExtInstalled] = useState<boolean | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    void detectExtension().then((r) => setExtInstalled(r.installed));
  }, []);

  const grouped = useMemo(() => {
    const g: Record<Readiness, ChannelRow[]> = { oauth: [], ready: [], needsKey: [], waiting: [] };
    for (const r of list) g[r.readiness].push(r);
    // 추천 채널을 각 그룹 앞으로 — 사장님 업종에 맞는 것부터 보게
    for (const k of READINESS_ORDER) {
      g[k].sort((a, b) => Number(recommended.includes(b.id)) - Number(recommended.includes(a.id)));
    }
    return g;
  }, [list, recommended]);

  function onToggle(id: ChannelId, next: boolean) {
    setBusy(id);
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, connected: next } : r))); // 낙관적
    start(async () => {
      const res = await toggleChannel(id, next);
      if (res.error) setList((prev) => prev.map((r) => (r.id === id ? { ...r, connected: !next } : r)));
      setBusy(null);
    });
  }

  const readyCount = grouped.ready.length;
  const oauthCount = grouped.oauth.length;

  /**
   * 연결 결과 안내. 주소창 문구는 **고객이 읽는 말**로만 옮긴다 —
   * `not_ready` 를 "App ID 가 없습니다"로 풀면 고객이 할 수 있는 게 없는 정보가 된다.
   */
  const notice = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location.search);
    const connected = q.get('connected');
    if (connected) {
      const name = rows.find((r) => r.id === connected)?.name ?? '채널';
      return { tone: 'ok' as const, msg: `${name}이 연결됐어요. 이제 글이 자동으로 올라갑니다.` };
    }
    if (q.get('canceled')) return { tone: 'info' as const, msg: '연결을 취소하셨어요. 언제든 다시 하실 수 있어요.' };
    const err = q.get('error');
    if (err === 'not_ready') return { tone: 'info' as const, msg: '아직 준비 중인 채널이에요. 열리면 알려드릴게요.' };
    if (err) return { tone: 'info' as const, msg: '연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.' };
    return null;
  }, [rows]);

  return (
    <div className="min-h-screen">
      <AppHeader storeName={storeName} current="/channels" />

      <main className="mx-auto max-w-3xl px-5 py-8 sm:px-6">
        {/* 연결하고 돌아왔는데 화면이 그대로면 됐는지 안 됐는지 모른다.
            실패해도 우리 사정(App ID·심사·에러 원문)은 말하지 않는다 — 원인은 서버에 남는다. */}
        {notice && (
          <div
            className={`mb-5 flex items-center gap-2.5 rounded-[var(--radius)] border px-4 py-3 ${
              notice.tone === 'ok'
                ? 'border-[var(--color-good)]/40 bg-[var(--color-good)]/[0.07]'
                : 'border-[var(--color-hair)] bg-[var(--color-panel)]'
            }`}
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: notice.tone === 'ok' ? 'var(--color-good)' : 'var(--color-fg-3)' }}
            />
            <span className="text-[13px] text-[var(--color-fg-2)]">{notice.msg}</span>
          </div>
        )}

        <div className="eyebrow">채널</div>
        <h1 className="h1 mt-2">어디에 올릴지 정해요</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-fg-2)]">
          {bizLabel}에 맞춰 골라뒀어요.
          {oauthCount > 0 && <> <b className="text-[var(--color-fg)]">{oauthCount}곳</b>은 로그인 한 번이면 자동으로 올라가고,</>}
          {' '}<b className="text-[var(--color-fg)]">{readyCount}곳</b>은 지금 바로 쓰실 수 있어요.
        </p>

        {/* 확장 — 6곳을 한 번에 여는 유일한 동작이라 가장 앞에 세운다.
            이미 깔았으면 조용히 확인만(설치를 다시 권하면 잔소리가 된다) */}
        {extInstalled === false && (
          <div className="mt-6 rounded-[var(--radius-lg)] border border-[var(--color-amber)]/40 bg-[var(--color-amber)]/[0.06] p-5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-amber)]" />
              <span className="text-[14px] font-medium text-[var(--color-fg)]">
                크롬 확장을 깔면 {readyCount}곳이 버튼 하나가 됩니다
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-fg-2)]">
              지금은 글을 복사해 직접 붙여넣으셔야 해요. 확장을 깔면 앱에서 버튼만 누르면
              네이버 블로그·플레이스 글쓰기 화면에 <b className="text-[var(--color-fg)]">제목과 본문이 채워진 채로</b> 열립니다.
              설치는 5분, 아이디·비밀번호는 받지 않습니다.
            </p>
            <a
              href="/extension-guide"
              className="btn-primary mt-4 inline-block rounded-full px-5 py-2.5 text-[13px] font-medium"
            >
              설치 방법 보기
            </a>
          </div>
        )}
        {extInstalled === true && (
          <div className="mt-6 flex items-center gap-2.5 rounded-[var(--radius)] border border-[var(--color-hair)] bg-[var(--color-panel)] px-4 py-3">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-good)]" />
            <span className="text-[13px] text-[var(--color-fg-2)]">
              확장이 켜져 있어요. 글마다 <b className="text-[var(--color-fg)]">바로 채우기</b> 버튼이 뜹니다.
            </span>
          </div>
        )}

        {READINESS_ORDER.map((k) => {
          const items = grouped[k];
          if (!items.length) return null;
          const meta = READINESS_LABEL[k];
          return (
            <section key={k} className="mt-8">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-medium tracking-tight">{meta.title}</h2>
                <span className="mono text-[11px] text-[var(--color-fg-4)]">{items.length}</span>
              </div>
              <p className="mt-1 text-[12.5px] text-[var(--color-fg-3)]">{meta.desc}</p>

              <div className="mt-3 divide-y divide-[var(--color-hair)] overflow-hidden rounded-[var(--radius)] border border-[var(--color-hair)]">
                {items.map((r) => (
                  <ChannelLine
                    key={r.id}
                    row={r}
                    busy={busy === r.id}
                    recommended={recommended.includes(r.id)}
                    onToggle={onToggle}
                    onOpenKey={() => setOpenKey(r.id)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </main>

      {openKey && (
        <KeySheet
          channelId={openKey}
          onClose={() => setOpenKey(null)}
          onSaved={() => {
            setList((prev) => prev.map((r) => (r.id === openKey ? { ...r, hasKey: true, connected: true } : r)));
            setOpenKey(null);
          }}
        />
      )}
    </div>
  );
}

/** 한 줄 = 채널 하나. 왼쪽은 정체성, 오른쪽은 **지금 할 수 있는 것** */
function ChannelLine({
  row, busy, recommended, onToggle, onOpenKey,
}: {
  row: ChannelRow;
  busy: boolean;
  recommended: boolean;
  onToggle: (id: ChannelId, next: boolean) => void;
  onOpenKey: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-[var(--color-panel)] px-4 py-3.5">
      <span className="h-6 w-[3px] shrink-0 rounded-full" style={{ background: row.color }} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-[var(--color-fg)]">{row.name}</span>
          {recommended && (
            <span className="mono shrink-0 rounded-[4px] bg-[var(--color-amber)]/15 px-1.5 py-0.5 text-[10px] text-[var(--color-amber)]">
              추천
            </span>
          )}
        </div>

        {/* 실적 — "연결됨"이라고 적고 0건이면 그게 바로 보이게 같은 줄에 둔다 */}
        <div className="mt-0.5 text-[12px] text-[var(--color-fg-3)]">
          {row.readiness === 'waiting' ? (
            WAITING_REASON[row.id] ?? '아직 준비 중이에요'
          ) : row.readiness === 'oauth' ? (
            row.connected
              ? <span className="text-[var(--color-good)]">연결됐어요 · 자동으로 올라갑니다</span>
              : OAUTH_CHANNELS.find((o) => o.id === row.id)?.unlocks
          ) : row.readiness === 'needsKey' ? (
            row.hasKey ? '키가 등록돼 있어요' : KEY_CHANNELS.find((k) => k.id === row.id)?.unlocks
          ) : row.writesContent ? (
            <span className="mono">
              만든 글 {row.made} · 올림 {row.posted}
            </span>
          ) : (
            '여기엔 글을 만들지 않아요'
          )}
        </div>
      </div>

      <div className="shrink-0">
        {row.readiness === 'oauth' ? (
          // 고객은 자기 계정으로 로그인만 한다 — 앱 등록·심사는 우리가 끝내 뒀다
          <a
            href={`/api/connect/${row.id}`}
            className="btn-primary rounded-full px-4 py-1.5 text-[12.5px] font-medium"
          >
            {row.connected ? '다시 연결' : '연결하기'}
          </a>
        ) : row.readiness === 'needsKey' ? (
          <button
            type="button"
            onClick={onOpenKey}
            className="rounded-full border border-[var(--color-hair-strong)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--color-fg-2)] transition hover:border-[var(--color-amber)] hover:text-[var(--color-fg)]"
          >
            {row.hasKey ? '키 바꾸기' : '키 넣기'}
          </button>
        ) : row.readiness === 'waiting' ? (
          <span className="mono text-[11px] text-[var(--color-fg-4)]">대기</span>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={row.connected}
            aria-label={`${row.name} ${row.connected ? '끄기' : '켜기'}`}
            disabled={busy}
            onClick={() => onToggle(row.id, !row.connected)}
            className={`h-6 w-11 rounded-full border transition disabled:opacity-50 ${
              row.connected
                ? 'border-[var(--color-good)] bg-[var(--color-good)]/25'
                : 'border-[var(--color-hair-strong)] bg-transparent'
            }`}
          >
            <span
              className={`block h-4 w-4 rounded-full transition ${
                row.connected ? 'translate-x-[22px] bg-[var(--color-good)]' : 'translate-x-[3px] bg-[var(--color-fg-4)]'
              }`}
            />
          </button>
        )}
      </div>
    </div>
  );
}

/** 키 입력 — 발급처로 바로 보내고, 붙여넣기만 하면 끝나게 */
function KeySheet({
  channelId, onClose, onSaved,
}: {
  channelId: ChannelId;
  onClose: () => void;
  onSaved: () => void;
}) {
  const spec = KEY_CHANNELS.find((k) => k.id === channelId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  if (!spec) return null;
  const filled = spec.fields.every((f) => (values[f.key] ?? '').trim().length > 0);

  async function save() {
    setSaving(true);
    setErr('');
    const res = await saveChannelKey(channelId, values).catch((e: Error) => ({ ok: false, error: e.message }));
    setSaving(false);
    if (!res.ok) {
      setErr(res.error ?? '저장하지 못했어요');
      return;
    }
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[var(--radius-lg)] border border-[var(--color-hair)] bg-[var(--color-panel)] p-5 sm:rounded-[var(--radius-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="eyebrow">{spec.issuer}</div>
        <h2 className="h2 mt-1.5">{spec.unlocks}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-fg-2)]">{spec.issuer}에서 발급받아 아래에 붙여넣으시면 됩니다.</p>

        <a
          href={spec.issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-between rounded-[var(--radius)] border border-[var(--color-hair)] bg-[var(--color-panel-2)] px-4 py-3 transition hover:border-[var(--color-hair-strong)]"
        >
          <span className="text-[13px] text-[var(--color-fg-2)]">
            {spec.issuer}에서 발급받기
          </span>
          <span className="text-[12px] font-medium text-[var(--color-amber)]">열기 ↗</span>
        </a>

        <div className="mt-4 space-y-3">
          {spec.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="eyebrow">{f.label}</span>
              <input
                type="password"
                autoComplete="off"
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder="발급받은 값을 붙여넣으세요"
                className="mt-1.5 w-full rounded-[var(--radius-sm)] border border-[var(--color-hair)] bg-[var(--color-bg)] px-3.5 py-2.5 text-[14px] outline-none focus:border-[var(--color-amber)]"
              />
            </label>
          ))}
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-fg-3)]">
          비밀번호가 아니라 <b className="text-[var(--color-fg-2)]">사장님이 발급하신 키</b>예요.
          언제든 발급처에서 없앨 수 있고, 저희는 이 키로 매출을 읽는 것 말고는 하지 않습니다.
        </p>

        {err && <p className="mt-3 text-[13px] text-[var(--color-bad)]">{err}</p>}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[var(--color-hair-strong)] px-5 py-2.5 text-[14px] text-[var(--color-fg-2)]"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!filled || saving}
            className="btn-primary flex-1 rounded-full py-2.5 text-[14px] font-medium disabled:opacity-40"
          >
            {/* 실제로 눌러 보는 채널만 "확인" 이라고 쓴다 — 안 하면서 쓰면 그게 거짓말이다 */}
            {saving ? (canVerifyKey(channelId) ? '확인하는 중…' : '저장하는 중…') : '저장하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
