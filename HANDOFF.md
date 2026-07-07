# 🖥️ 맥북에서 이어가기 — 인수인계

> Windows PC(회사) → 맥북(집) 이어작업용. 이 파일만 따라 하면 5분 안에 이어집니다.

## 0. 사전 (맥북에 한 번만)

```bash
# Node 22+ 확인 (없으면 https://nodejs.org 설치)
node -v

# gh CLI (없으면: brew install gh)
gh auth login
```

## 1. 코드 받기

```bash
cd ~/  # 원하는 위치
git clone https://github.com/billyssam/marketing-allinone.git
cd marketing-allinone
```

## 2. 의존성 설치

```bash
npm install --prefix web
npm install --prefix backend
npm install --prefix bot
```

## 3. 환경변수 (`.env.local` 새로 만들기)

`.env.local`은 보안상 Git에 없음. **회사 PC의 `web/.env.local` 값을 그대로 옮겨** 새로 만든다:

```bash
cp web/.env.local.example web/.env.local
# 편집기로 열어서 값 채우기 (아래 키 목록 참고)
```

채울 키 (회사 PC `web/.env.local`에서 복사):
- `NEXT_PUBLIC_SUPABASE_URL` = `https://oricgerprwgijnowjokn.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (Supabase → Settings → API Keys → anon)
- `SUPABASE_SERVICE_ROLE_KEY` = (같은 페이지 → secret key `sb_secret_...`)
- `GOOGLE_GENERATIVE_AI_API_KEY` = (AI Studio 키 `AQ...`)
- `NEXT_PUBLIC_APP_URL` = `http://localhost:3000`
- (네이버 로그인 켤 때) `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`

> 💡 키 자체는 Supabase/AI Studio 대시보드에서 언제든 다시 복사 가능. 유출 걱정되면 재발급.

## 4. 실행

```bash
npm run dev --prefix web      # → http://localhost:3000
```

## 5. Claude Code로 이어가기

맥북에서 `claude` 실행 (같은 Anthropic 계정) →
```
마케팅올인원 이어서 하자
```
→ 대화 맥락(메모리)은 계정 기반이라 **자동으로 이어짐**. 오늘까지 한 것 전부 기억함.

## 6. MCP (선택 — 맥북에도 필요하면)

```bash
bash ~/install-mcps.sh   # 회사 PC에서 만든 스크립트를 맥북에 옮겨 실행
```

---

## 📌 현재 진행 상태 (2026-07-07 기준)

### ✅ 완료
- **A구간**: Supabase 인증(이메일·카카오·구글·네이버) + 온보딩 위저드 + 대시보드 실데이터. DB E2E 검증 통과.
- **B구간 코어**: 콘텐츠엔진 → 채널별 재단(블로그·인스타·플레이스·당근) + 네이티브 재작성 + 발행 라우팅(자동/카톡 핸드오프).
- **채널 플랫폼**: 28채널 레지스트리 + Wave1 어댑터 7개 + 랜딩 마켓플레이스 + 연결센터.

### ⏳ 다음 (맥북에서 이어갈 것)
1. **Gemini 유료 전환 확인** → 네이티브 톤 라이브 검증 (무료 20회/일 한도 때문. AI Studio 결제 연결 필요)
2. **posts 테이블 영속화** — 생성 드래프트 DB 저장
3. **대시보드 "오늘의 브리핑"** 실연동
4. **소셜 OAuth 앱 등록** (카카오·구글·네이버 개발자앱)
5. **리뷰 모니터링** 크롤러

### 🚨 주의
- Supabase 조직 `billyssam` 무료한도 초과 → grace 2026-07-14까지. 파일럿 전 별도 org로 이전 필요.
- Gemini 무료 20회/일 → 유료 전환 필요 (Flash 매우 저렴, 월 몇 천원).

### 핵심 파일 지도
- `web/src/app/{login,signup,onboarding,dashboard,auth,channels}/` — 인증·온보딩·대시보드
- `web/src/lib/supabase/` — Supabase 클라이언트 3종
- `shared/channels/{registry,adapter}.ts` — 채널 정의·계약
- `shared/content-engine/{orchestrator,channel-formatter,channel-native}.ts` — 콘텐츠→채널
- `backend/src/channels/` — 어댑터 7개, `backend/src/publish.ts` — 발행 라우팅
- `backend/supabase/migrations/` — 스키마 (0001~0003, Supabase SQL Editor에 적용됨)
- 상세 로드맵: `docs/roadmap.md`, `docs/channel-roadmap.md`
