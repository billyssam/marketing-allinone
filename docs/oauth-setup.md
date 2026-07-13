# 소셜 로그인 OAuth 앱등록 가이드

> ✅ Supabase 정본 = `exmbpietyadkjnunrhka` / 라이브 도메인 = https://marketing-allinone.vercel.app
> 코드(카카오·구글=Supabase 네이티브, 네이버=커스텀 플로우)는 이미 완성 — **아래 외부 앱 등록만 하면 켜짐**.

## 공통 값 (복붙용)

| 용도 | 값 |
|---|---|
| 카카오·구글 Redirect URI | `https://exmbpietyadkjnunrhka.supabase.co/auth/v1/callback` |
| 네이버 Callback URL (운영) | `https://marketing-allinone.vercel.app/auth/naver/callback` |
| 네이버 Callback URL (로컬) | `http://localhost:3000/auth/naver/callback` |

## 1. 카카오 (제일 중요 — 사장님 대부분 카카오)

1. https://developers.kakao.com → 내 애플리케이션 → **애플리케이션 추가** (이름: 마케팅올인원)
2. 앱 설정 → 플랫폼 → **Web 플랫폼 등록**: `https://marketing-allinone.vercel.app` (+ 로컬 테스트용 `http://localhost:3000`)
3. 제품 설정 → **카카오 로그인 활성화** → Redirect URI에 위 공통 callback URL 등록
4. 동의항목: 닉네임(필수), **카카오계정 이메일(필수 동의)** ← 이메일 없으면 Supabase 매칭 안 됨
5. 앱 키 → **REST API 키** 복사 + 제품설정→보안→**Client Secret 생성** 복사
6. → Supabase [Providers](https://supabase.com/dashboard/project/exmbpietyadkjnunrhka/auth/providers) → **Kakao** Enable → (Client ID = REST API 키, Client Secret) 입력 → Save

## 2. 구글

1. https://console.cloud.google.com → 새 프로젝트 → **APIs & Services → OAuth consent screen**
   - External, 앱 이름·지원 이메일(billy5285@gmail.com). 테스트 모드로 시작 OK
2. **Credentials → Create Credentials → OAuth client ID** (Web application)
   - Authorized redirect URIs: 위 공통 callback URL
3. Client ID + Client Secret 복사 → Supabase Providers → **Google** Enable → 입력 → Save

## 3. 네이버 (커스텀 플로우 — Supabase 네이티브 미지원)

1. https://developers.naver.com → Application → **애플리케이션 등록**
   - 사용 API: **네이버 로그인** / 제공 정보: 이메일(필수), 닉네임
2. 서비스 URL: `https://marketing-allinone.vercel.app`
   **Callback URL: 위 네이버 Callback URL(운영+로컬 둘 다 등록)**
   (⚠️ 네이버만 Supabase callback이 아니라 **자체 구현** — `/auth/naver/start`→`/auth/naver/callback`, 서비스롤로 Supabase 유저 생성. 코드 이미 있음)
3. Client ID + Client Secret → **Vercel 환경변수**에 추가(운영) + `web/.env.local`(로컬):
   ```
   NAVER_CLIENT_ID=...
   NAVER_CLIENT_SECRET=...
   ```
   Vercel: `vercel env add NAVER_CLIENT_ID production` / `...SECRET...`

## 4. Supabase URL 설정 (한 번만)

[URL Configuration](https://supabase.com/dashboard/project/exmbpietyadkjnunrhka/auth/url-configuration)
- **Site URL**: `https://marketing-allinone.vercel.app`
- **Redirect URLs** 에 추가:
  - `https://marketing-allinone.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback` (로컬 개발용)

## 등록 후 체크리스트

- [ ] 카카오·구글 = Supabase 대시보드 Providers에만 입력 (키를 코드/깃에 넣지 말 것)
- [ ] 네이버 = Vercel env + `web/.env.local` 2줄
- [ ] Supabase URL Configuration Site URL·Redirect URLs 등록
- [ ] 운영 도메인에서 `/login` 각 버튼 실클릭 테스트 (완료 후 클로드가 검증)
