# 24/7 운영 런북

> 이 서비스의 "서버"는 **Vercel(웹) + Supabase(DB) + GitHub Actions(크론)** 조합이다.
> PC·VM 의존 0 — 전부 클라우드에서 24시간 돈다. 실패는 GitHub 이슈(→이메일)로 울린다.

## 하루 타임라인 (KST)

| 시각 | 워크플로 | 역할 |
|---|---|---|
| 05:30 | `auth-config-check` | **가입·로그인·재설정이 실제로 되는가** (리다이렉트 허용목록 + 메일 도달) |
| 06:00 | `uptime-check` | 프로덕션 생존(랜딩 200 + `/api/health` DB 실확인) |
| 07:30 | `daily-content` | 연결 매장 전부에 오늘 초안 생성(블로그 anchor + 연결 채널) |
| 08:30 | `daily-content` (2차) | **자가치유 재시도** — 멱등 스킵 덕에 실패 매장만 재생성 |
| 09 · 14 · 19 · 23 | `review-crawl` | 리뷰 수집·감정분석 (+ 플레이스 사실 7일 멱등) · **부정 리뷰는 사장님 폰으로 즉시 푸시**. 마지막 회차가 23시인 건 손님이 방문한 저녁에 리뷰를 쓰기 때문 |
| 09:30 | `morning-ready` | **비즈니스 SLA** — 크론 성공 여부가 아니라 "초안이 DB에 실존하는가" 전수 확인 |
| 13:00 | `owner-journey` | **사장님 여정 완주 검증** — 초대→온보딩→첫 글→붙여넣기→답글→리포트를 실제 브라우저로. 초안이 멀쩡해도 여기서 막히면 사장님은 아무것도 못 한다 |
| 월요일 09:00 | `weekly-digest` | 전 매장 주간 리포트를 이슈로 — **운영자가 카톡으로 전달**(🔴부정 미답변/⚠️할 일/✅깨끗) |
| 매월 1일 | `ops-keepalive` | 커밋 40일↑면 빈 커밋 — GitHub 스케줄 60일 자동비활성 방지 |

- GitHub 크론은 1~2시간 지연이 흔함(07:30 예약 → 실발화 08:1x). 타임라인은 그 지연을 흡수하도록 설계됨.
- 부수효과: 매일 DB 쓰기 → Supabase 무료 프로젝트 자동 일시정지 방지.

## 알림 이슈별 대응

### 🔴 서비스 다운 감지
1. https://marketing-allinone.vercel.app/api/health 직접 확인 — `db:false`면 Supabase, 접속 자체가 안 되면 Vercel.
2. Supabase 대시보드(`exmbpietyadkjnunrhka`, 별도 무료계정)에서 프로젝트 상태 확인 — paused면 Restore.
3. Vercel 대시보드에서 마지막 배포 상태 확인 — 빌드 실패면 마지막 커밋 원인 수정.

### 🔴 데일리 콘텐츠 크론 실패
1. 이슈 본문의 런 로그 확인. 흔한 원인: Gemini 429(쿼터), Supabase 접속.
2. 08:30 재시도가 이미 자가치유를 시도함 — `morning-ready`(09:30)까지 조용하면 해결된 것.
3. 수동 복구: Actions → `데일리 콘텐츠 생성` → Run workflow (멱등이라 안전).
4. Gemini 쿼터 참고: flash 무료 = 프로젝트당 **20회/일**(실측), 소진 시 flash-lite 자동 폴백. 파일럿 매장 수 늘면 유료 전환 검토.

### 🔴 아침 초안 미준비 (최종 방어선)
크론이 "성공"으로 보여도 DB가 비어 있으면 이게 울린다.
1. Actions → `데일리 콘텐츠 생성` → Run workflow 즉시 수동 실행.
2. 로그에서 어느 매장이 왜 실패하는지 확인(매장별 에러가 찍힘).

### 🔴 인증 설정 문제 (가입·로그인·재설정)

헬스체크는 통과하는데 사장님만 못 들어오는 상태를 잡는다. 로그에 원인과 조치가 그대로 찍힌다.

1. **리다이렉트 허용목록** — Supabase는 허용목록에 없는 주소를 **에러 없이 Site URL로 바꿔치기**한다.
   운영 주소가 빠져 있으면 재설정 메일·가입 확인 메일·카카오/구글 OAuth 콜백이 전부 죽은 링크가 된다.
   조치: Supabase → Authentication → URL Configuration →
   Site URL `https://marketing-allinone.vercel.app`, Redirect URLs에 `https://marketing-allinone.vercel.app/**`.
2. **메일 도달** — 내장 메일 서비스는 프로젝트 전체 **시간당 2통**, 팀 외 주소는 발송 거부.
   확인메일 ON 상태에서 사장님이 직접 가입하면 `429`로 **계정조차 생성되지 않는다**.
   조치 A: 커스텀 SMTP(Resend 등) 연결 후 repo variable `CUSTOM_SMTP_CONFIGURED=true`.
   조치 B: 그때까지는 초대 방식 — `cd backend && npx tsx src/invite-owner.ts <이메일> <이름>`.

### 🔴 리뷰 수집 크론 실패
1. 하루 3회 도니 다음 회차가 자동 재시도.
2. **연속 실패**면 네이버 플레이스 마크업 변경 가능성 — `backend/src/crawl-reviews.ts` 셀렉터 점검.

## 수동 점검 명령 (로컬)

```bash
# 🚦 파일럿 준비 점검 — "지금 사장님을 받아도 되나" 한 번에
# (서비스·초대 링크·매장별 오늘 초안+품질·Gemini 한도. 막는 것만 exit 1)
cd backend && npm run preflight

# 인증 설정 (가입·로그인·재설정이 실제로 되는가)
# ⚠️ OWNER_SIGNUP_MODE를 빼면 "확인메일 ON인데 SMTP 없음"으로 가짜 🔴이 뜬다.
#    크론은 repo variable로 이 값을 주고 있다 — 로컬에서도 똑같이 줘야 같은 결과가 나온다.
cd backend && OWNER_SIGNUP_MODE=invite npx tsx src/check-auth-config.ts

# 파일럿 사장님 초대 (메일 없이 계정 열기 → 카톡 안내문 출력)
cd backend && npx tsx src/invite-owner.ts owner@example.com "쿵더쿵 사장님"

# 주간 다이제스트 (전 매장 요약 → 카톡으로 복사 전달)
cd backend && npx tsx src/weekly-digest.ts

# 아침 준비 상태 (연결 매장 전수)
cd backend && npx tsx src/check-morning-ready.ts

# 데일리 생성 (멱등 — 오늘분 있으면 스킵)
cd backend && npx tsx src/generate-daily.ts

# 헬스
curl https://marketing-allinone.vercel.app/api/health
```

## 🔴 크론 주기를 바꾸기 전에 — 청구는 '실행시간'이 아니다

**GitHub은 작업마다 분 단위로 올려서 청구한다.** 133초 걸리는 회차는 **3분**으로 청구된다.
이걸 놓치고 리뷰 크롤을 3회/일 → 8회/일로 올렸다가 이 저장소만으로 월 ~1,080분을 쓰게 됐고,
2026-08-22 **Actions 예산 $0 차단으로 전 워크플로가 사흘간 멈췄다**(그동안 초안·리뷰 수집 0).

주기를 늘릴 땐 반드시 이렇게 센다:

```
회차당 청구분 = ceil(실행초 / 60)
월 청구분 = Σ(워크플로별 회차당 청구분 × 하루 회수) × 30
```

현재 구성(회차 실측 기준): 리뷰 12 + 데일리 4 + 아침검증 2 + 여정검증 4 + 생존 1 + 인증 1
= **하루 24분 = 월 720분** / 무료 2,000분. 이 저장소 외에 다른 저장소도 같은 한도를 나눠 쓴다.

**차단됐을 때 증상**: 워크플로가 실패로 뜨는데 **로그가 아예 없다**(`log not found`).
job이 시작조차 못 한 것이다. 확인은 런 annotation:

```bash
gh api repos/billyssam/marketing-allinone/check-runs/<job_id>/annotations
```

예산 설정: https://github.com/settings/billing/budgets — Actions 예산이 `$0` + `Stop usage: Yes`면
무료분이 남아 있어도 막힌다. 소액($2)으로 두면 무료분은 그대로 쓰고 초과분만 상한이 걸린다.

## 설계 원칙

- **조용한 실패 금지**: generate-daily는 부분 실패도 exit 1 → 알림.
- **모든 크론 멱등**: 재실행이 항상 안전(초안 중복 생성·리뷰 중복 저장 없음).
- **알림 중복 방지**: 같은 날 같은 유형 이슈는 1개만.
- **감시는 이중**: 인프라 레벨(uptime)과 비즈니스 레벨(morning-ready)을 분리.
