# 🍎 집(맥북)에서 마케팅올인원 이어하기 — 완결판

> 위에서부터 **순서대로 복붙**만 하면 됩니다. 막히면 맨 아래 "문제 해결" 참고.
> 예상 소요: **5~10분**.

---

## 🚀 최신 상태 (2026-07-13, HEAD `6dc2904`)

- **라이브 배포**: https://marketing-allinone.vercel.app (Vercel · Git 자동배포 — `git push`하면 자동 반영)
- **Supabase 프로젝트**: `exmbpietyadkjnunrhka`
  - ⚠️ 맥북 `.env.local`은 옛 키일 수 있음 → **`Desktop\마케팅올인원_새키_0709.txt`** 값(새 프로젝트)으로 맞출 것
- **리뷰 자동수집**: GitHub Actions 매일 09시 KST 자동
- **demo 계정**: `demo@example.com` / `Demo!2345` (쿵더쿵 데모, 리뷰9·단골1)

### ✅ 오늘(7/13) 완성된 것 — 전부 라이브·실측
가입→온보딩(프리미엄)→채널연결(실토글)→리뷰수집·답글→**재방문 단골관리(/regulars)**→**매장설정(/settings)** 전 루프 작동.
+ 성과 실데이터, 소셜로그인 우아한 폴백, 모바일 QA, 404/에러/로딩 스켈레톤, 이메일가입 견고화.

### 🔜 집에서 이어서 할 것 (우선순위)
1. **소셜 로그인 켜기** (사장님 몫, 코드·폴백 완성) — `docs/oauth-setup.md` 따라 카카오/구글 앱등록 → Supabase Providers에 키 입력. Redirect URI=`https://exmbpietyadkjnunrhka.supabase.co/auth/v1/callback`
2. **콘텐츠 생성 살리기** — Gemini 결제 연결(aistudio.google.com/app/apikey) → '오늘 글 생성' 실동작
3. **이메일 확인메일 OFF** (선택, 파일럿 매끄러운 가입) — Supabase Auth→Email→Confirm email OFF
4. **재방문 알림톡 발송 연결** — 알리고/카카오비즈 알림톡 credential (지금은 메시지 생성·복사까지 됨)
5. 남은 신규: 카톡봇 진입점, 콘텐츠 생성 UX 강화

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
> - Supabase: supabase.com/dashboard → 프로젝트 `oricgerprwgijnowjokn` → Settings → API Keys
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

## 📋 오늘까지 완료 / 다음 할 일

### ✅ 완료
- **A구간**: Supabase 인증(이메일·카카오·구글·네이버) + 온보딩 위저드 + 대시보드. DB E2E 검증 통과.
- **B구간 코어**: 콘텐츠엔진 → 채널별 재단(블로그·인스타·플레이스·당근) + 네이티브 재작성 + 발행 라우팅.
- **채널 플랫폼**: 28채널 레지스트리 + Wave1 어댑터 7개.

### ⏳ 집에서 이어갈 것 (우선순위)
1. **Gemini 유료 전환 확인** → 네이티브 톤 라이브 검증 (무료 20회/일 한도 소진됨)
   - aistudio.google.com/app/apikey → 결제 연결 (Flash 매우 저렴, 월 몇 천원)
2. **posts 테이블 영속화** (생성 드래프트 DB 저장)
3. **대시보드 "오늘의 브리핑"** 실연동
4. **소셜 OAuth 앱 등록** (카카오·구글·네이버 개발자앱 → 실제 소셜 로그인 켜기)

### 🚨 기억할 제약
- Supabase 조직 `billyssam` 무료한도 초과 → **2026-07-14까지 grace**. 파일럿 전 별도 org 이전 필요.
- Gemini 무료 20회/일 → 유료 전환 필요.

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
