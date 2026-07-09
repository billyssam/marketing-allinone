# 소셜 로그인 OAuth 앱등록 가이드 (#4)

> DB 복구(RESTORE-SUPABASE.md)와 무관하게 **앱 등록까지는 지금 진행 가능**.
> Redirect URI에 들어갈 `<PROJECT_REF>`만 새 Supabase 프로젝트 생성 후 채우면 됨.
> 공통 Redirect URI 형식: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

## 1. 카카오 (제일 중요 — 사장님 대부분 카카오)

1. https://developers.kakao.com → 내 애플리케이션 → **애플리케이션 추가** (이름: 마케팅올인원)
2. 앱 설정 → 플랫폼 → **Web 플랫폼 등록**: `http://localhost:3000` (배포 후 도메인 추가)
3. 제품 설정 → **카카오 로그인 활성화** → Redirect URI에 위 callback URL 등록
4. 동의항목: 닉네임(필수), **카카오계정 이메일(필수 동의)** ← 이메일 없으면 Supabase 매칭 안 됨
5. 앱 키에서 **REST API 키** + 제품설정→보안→**Client Secret 생성** 복사
6. → Supabase Authentication → Providers → Kakao에 (REST API 키, Secret) 입력

## 2. 구글

1. https://console.cloud.google.com → 새 프로젝트 → **APIs & Services → OAuth consent screen**
   - External, 앱 이름·지원 이메일(billy5285@gmail.com)만 채우면 됨. 테스트 모드로 시작 OK
2. **Credentials → Create Credentials → OAuth client ID** (Web application)
   - Authorized redirect URIs: 위 callback URL
3. Client ID + Client Secret 복사 → Supabase Providers → Google에 입력

## 3. 네이버

1. https://developers.naver.com → Application → **애플리케이션 등록**
   - 사용 API: **네이버 로그인** / 제공 정보: 이메일(필수), 닉네임
2. 서비스 URL: `http://localhost:3000` / **Callback URL: `http://localhost:3000/auth/naver/callback`**
   (⚠️ 네이버만 Supabase callback이 아님 — 자체 구현 플로우가 이미 코드에 있음:
   `/auth/naver/start` → `/auth/naver/callback`, 서비스롤로 Supabase 유저 생성)
3. Client ID + Client Secret 복사 → `web/.env.local`에 추가:
   ```
   NAVER_CLIENT_ID=...
   NAVER_CLIENT_SECRET=...
   ```

## 등록 후 체크리스트

- [ ] `web/.env.local`에 네이버 키 2줄 추가 (카카오·구글은 Supabase 대시보드에만)
- [ ] Supabase → Authentication → URL Configuration → Site URL `http://localhost:3000`
- [ ] `node scripts/verify-db.mjs` 통과 상태에서 `/login` 각 버튼 실클릭 테스트
- [ ] 배포 도메인 확정되면 각 콘솔에 프로덕션 URL/Redirect 추가
