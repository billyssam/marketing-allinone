# 🍎 집(맥북)에서 마케팅올인원 이어하기 — 완결판

> 위에서부터 **순서대로 복붙**만 하면 됩니다. 막히면 맨 아래 "문제 해결" 참고.
> 예상 소요: **5~10분**.

---

## 🦴 골격 작업 중 (2026-07-20, HEAD `147c2db`) — 내일 여기서 이어감

> **방향(사용자 확정)**: 지금은 세부 마감이 아니라 **골격**을 맞추는 단계.
> **원칙 ⓪(머리에 박음)**: 이 도구 하나로 **모든 업종·제품·서비스** 마케팅이
> **각 사용자 맞춤**으로 돌아가야 함. 쿵더쿵=테스트 인스턴스 하나. 스코프 좁히기 금지.

**오늘 세운 것 = 적응(adaptation) 엔진** (커밋 `fd3a4b9`→`147c2db`, 전부 배포됨):
- `shared/business/taxonomy.ts` = 심장. 9그룹 43업종, 각 업종이
  offering(menu/product/service/booking)·saleModes·preset·keywords를 가짐.
  `recommendedChannelsFor()`가 판매형태에서 채널을 파생(배달→배민, 온라인→스마트스토어).
  `resolveBusinessType()`가 미지 업종도 안전폴백 → **콘텐츠 생성 크래시 버그 해결**.
- `prompts/generic.ts` = product/service/booking offering별 콘텐츠 프리셋.
- 온보딩·채널센터·설정 3곳 모두 택소노미로 적응 배선(업종 선택→맞춤 채널 추천).
- `industries` 테이블 43업종 DB 시드 완료(`npx tsx src/seed-industries.ts`, FK 충족).
- **E2E 검증**: 왁싱살롱(skincare) 신규가입→서비스형 채널5→저장→서비스톤 콘텐츠 생성.

**내일 이어갈 골격 후보** (마감 아님, 구조):
1. **제품형 사업 데이터 모델** — 상품·재고(카페 place기반과 별개로, 소매/온라인셀러의 상품 목록).
2. **콘텐츠 엔진이 offering 축을 더 깊이** — 제품형은 상품 소재, 서비스형은 비포애프터/후기 소재를 실제 주입.
3. **대시보드가 업종별로** — 지금은 리뷰 중심. 판매형은 주문/매출, 예약형은 예약 지표로 적응.
> 어느 것부터 갈지는 사용자에게 방향 확인 후 진행(오늘도 두 번 방향 정정받음 → 골격은 확인하고 짓기).

**택소노미 확장법**: `shared/business/taxonomy.ts`의 `BUSINESS_TYPES`에 한 줄 추가
→ `npx tsx backend/src/seed-industries.ts` 재실행하면 온보딩·채널·설정 자동 반영.

---

## 🚀 이전 상태 (2026-07-15, HEAD `983cf6c`)

- **라이브 배포**: https://marketing-allinone.vercel.app (Vercel · Git 자동배포 — `git push`하면 자동 반영)
- **Supabase 프로젝트**: `exmbpietyadkjnunrhka`
  - ⚠️ 맥북 `.env.local`은 옛 키일 수 있음 → **`Desktop\마케팅올인원_새키_0709.txt`** 값(새 프로젝트)으로 맞출 것
- **demo 계정**: `demo@example.com` / `Demo!2345` (쿵더쿵 데모 — 리뷰9·단골1·글9건·인스타 연결됨)

### ✅ 완성된 자동 사이클 (사장님 관점, 전부 실측)
1. **가입 → 1분 내 첫 초안** (온보딩 직후 백그라운드 웰컴 드래프트, PROD 검증)
2. **매일 아침 자동**: 09:00 리뷰 수집(+플레이스 사실 크롤, 3회/일) → **07:30 초안 자동 생성**(크론 지연 흡수용 전진)
   - 인스타 연결 매장은 **블로그+인스타 세트**로
   - 글에 **진짜 메뉴·가격·영업시간** 주입 ("수제대추차(5,800원)" 급 사실 기반)
3. 브리핑 확인 → /prepare 30초 붙여넣기 → **자동 published** (지난 자동초안은 아침에 자동 보관 — 무덤 방지)
4. **글 보관함(/posts)** · 리뷰(/reviews) · 단골(/regulars) · 설정(/settings) · 채널(/channels) — 공용 AppHeader nav
+ 컴포저(주제·길이·채널), Gemini 429 우아한 안내, `/api/probe-after` 인프라 프로브

### 🆕 7/15 세션 (11커밋, 전부 PROD 실측)
- **크론 07:30 전진** + 주간차트·활동피드(3대 원칙 대시보드 완성) + 브리핑 무덤방지
- **PWA 복구**(아이콘 실재하지 않던 것 생성, #08080a 통일) + **없는 기능 약속 4곳 제거**(카톡봇·인스타API·알림톡 → '준비중' 뱃지)
- 🔴 **CSS 레이어 버그**: globals.css 비레이어 → border 유틸 17곳이 처음부터 죽어있었음 → @layer 분리 복원
- **middleware→proxy**(Next16 deprecation) + **보호라우트 최신화**(/reviews·/regulars·/settings·/posts 가드 누락 복구, 유출은 0이었음)
- **OG 이미지 신설**(카톡 공유 미리보기!) + favicon 브랜드 재생성(⚠️Turbopack ICO는 RGBA PNG 필수) + robots·sitemap
- **글 보관함 /posts** + AppHeader 공용화(5곳 복붙 해소) + 랜딩 죽은 CTA("파일럿 신청"→/signup) 수리
- **모바일 회귀**: truncate+flex min-width:auto 블로우아웃(대시보드 375px서 503px) → min-w-0 처방, 전수점검
- **파일럿 키트** `docs/pilot-kit.md` (카톡 초대문·체크리스트·FAQ)

### 🔜 이어서 할 것 (우선순위)
1. **⏰ 내일 아침: 데일리 크론 07:30 발화 확인** (GitHub Actions daily-content, 어제 첫 스케줄분 미발화로 전진시킴)
2. **소셜 로그인 켜기** (외부 등록, 코드·폴백 완성) — `docs/oauth-setup.md` 그대로. Redirect URI=`https://exmbpietyadkjnunrhka.supabase.co/auth/v1/callback`
3. **Gemini 결제** (선택) — 무료는 파일럿 3~4매장까지(20/일, 분당 제한도 있음)
4. **이메일 확인메일 OFF** (선택) — Supabase Auth→Email→Confirm email OFF
5. **재방문 알림톡 발송 연결** — 알리고 credential (메시지 생성·복사까진 이미 됨)
6. 남은 신규: 카톡봇 진입점(카카오 비즈채널 필요), 주간 리포트, 파일럿 초대(`docs/pilot-kit.md` 준비됨)

> 집에서 Claude 열고 **"마케팅올인원 이어서 하자"** → 위 상태 다 기억함(계정 메모리 동기화).

---

## ⭐ STEP 0. 준비물 (맥북에 한 번만)

터미널 열기: `⌘ + Space` → "터미널" 입력 → Enter

```bash
# Node 설치 확인 (v20 이상이면 OK, 없으면 아래 설치)
node -v
```
- 안 깔려있으면: [nodejs.org](https://nodejs.org) 에서 LTS 다운로드 후 설치 (또는 `brew install node`)

```bash
# GitHub CLI 확인 (없으면 설치)
gh --version || brew install gh

# GitHub 로그인 (브라우저 열림 → billyssam 계정 로그인)
gh auth login
```

---

## ⭐ STEP 1. 코드 내려받기

```bash
cd ~/Documents          # 원하는 위치 (예: 문서 폴더)
git clone https://github.com/billyssam/marketing-allinone.git
cd marketing-allinone
```

---

## ⭐ STEP 2. 키 파일 옮기기 (가장 중요)

회사 PC 바탕화면의 **`맥북용_키_백업.txt`** 를 맥북으로 옮긴다.
- 방법: USB / 카톡 "나에게 보내기" / 에어드롭 / 이메일 등 아무거나

그 파일 안의 내용이 아래 STEP 3에서 붙여넣을 값입니다.

> 🔑 필요한 키 4개 (백업 파일에 다 있음):
> - `NEXT_PUBLIC_SUPABASE_URL`
> - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
> - `SUPABASE_SERVICE_ROLE_KEY`
> - `GOOGLE_GENERATIVE_AI_API_KEY`
>
> ※ 백업 파일을 못 옮겼으면? 대시보드에서 재발급 가능:
> - Supabase: supabase.com/dashboard → 프로젝트 **`exmbpietyadkjnunrhka`** (⚠️별도 무료계정 소속, 옛 oricger…는 폐기됨) → Settings → API Keys
> - Gemini: aistudio.google.com/app/apikey

---

## ⭐ STEP 3. 의존성 설치 + 환경파일 만들기

```bash
# 의존성 (몇 분 걸림)
npm install --prefix web
npm install --prefix backend
npm install --prefix bot

# .env.local 생성
cp web/.env.local.example web/.env.local
open -e web/.env.local        # 텍스트편집기로 열림
```
→ 열린 편집기에 **`맥북용_키_백업.txt` 내용을 그대로 붙여넣고 저장(⌘S)**.
(`NEXT_PUBLIC_APP_URL=http://localhost:3000` 은 그대로 두면 됨)

---

## ⭐ STEP 4. 실행 (화면 확인)

```bash
npm run dev --prefix web
```
→ 브라우저에서 **http://localhost:3000** 열기.
랜딩 → `/signup` 가입 → 온보딩 → `/dashboard` 흐름이 돌면 성공.

멈추려면 터미널에서 `Control + C`.

---

## ⭐ STEP 5. Claude Code로 이어서 작업

터미널 새 탭(`⌘T`)에서:
```bash
cd ~/Documents/marketing-allinone
claude
```
Claude 뜨면 이렇게 입력:
```
마케팅올인원 이어서 하자
```
→ **오늘까지 한 작업 다 기억하고 있음** (메모리는 Anthropic 계정 기반 자동 동기화).

---

## 🔄 두 컴퓨터 오가기 (집 맥북 ↔ 사무실 윈도우)

**처음 세팅(clone·install·.env.local)은 각 기기에 딱 한 번.** 이후엔 아래 2명령만:

```
🚪 자리 뜰 때 (작업 끝):        🪑 자리 앉을 때 (작업 시작):
   git add .                       git pull
   git commit -m "한 것 요약"
   git push
```

- **황금 규칙: 떠날 때 `push`, 올 때 `pull`.** 이거만 지키면 안 꼬임.
- clone·npm install·.env.local 은 **다시 안 함** (기기에 계속 남음).
- 대화 맥락(메모리)은 Anthropic 계정 기반 **자동 동기화** — push/pull 불필요.
- ⚠️ push 안 하고 다른 기기서 작업하면 두 버전이 갈라져 충돌남. 반드시 떠나기 전 push.

> 처음 이 기기(맥북)는 위 STEP 1~3이 "처음 1회 세팅". 다음부터는 `git pull`로 시작.

---

## 🚨 기억할 제약

- **Gemini 무료 20회/일 + 분당(RPM) 제한** → 파일럿 3~4매장이 무료 한계. 그 이상은 결제.
- Supabase는 **별도 무료계정의 `exmbpietyadkjnunrhka`가 정본** (계정당 무료 2프로젝트 한도 때문. 옛 oricger…는 폐기, CARTON 프로젝트 건드리지 말 것).
- 크롤(Playwright)은 Vercel 서버리스 불가 → **GitHub Actions**가 담당(리뷰 3회/일 + 데일리 07:30). GitHub 크론은 1~2시간 지연이 정상.

---

## 🛠 문제 해결

| 증상 | 해결 |
|------|------|
| `npm run dev` 후 흰 화면/500 | `web/.env.local` 키 4개 다 채웠는지 확인. 특히 SERVICE_ROLE은 `sb_secret_`으로 시작해야 함 |
| 로그인 눌러도 안 됨 | Supabase → Authentication → Providers에서 해당 소셜 아직 안 켬. 이메일로 먼저 테스트 |
| `git clone` 권한 오류 | `gh auth login` 다시 |
| 포트 3000 이미 사용중 | `npm run dev --prefix web -- -p 3001` |
| Gemini 429 에러 | 무료 일일한도 소진 or 결제 미연결. 위 STEP 참고 |

---

## 🔗 참고
- GitHub: github.com/billyssam/marketing-allinone (private)
- 상세 로드맵: `docs/roadmap.md`, `docs/channel-roadmap.md`
- 핵심 파일 지도: `HANDOFF.md`
