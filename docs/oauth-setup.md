# 회원 로그인과 채널 OAuth 설정

2026-10-27 재점검. 운영 Supabase는 `exmbpietyadkjnunrhka`, 운영 주소는 https://marketing-allinone.vercel.app 이다.

자격증명 존재·앱 등록만으로 실제 연결/게시 완료가 되지 않는다. 최신 준비표·공식 근거·현재 누락 사항은 [채널 운영 자격증명 준비](CHANNEL_CREDENTIALS_PREPARATION_2026-10-27.md)를 따른다.

| 목적 | 콜백 | 자격증명 입력 위치 |
| --- | --- | --- |
| Google/Kakao 회원 로그인 | https://exmbpietyadkjnunrhka.supabase.co/auth/v1/callback | 운영 Supabase의 해당 Providers |
| Naver 회원 로그인 | https://marketing-allinone.vercel.app/auth/naver/callback | Vercel NAVER_CLIENT_ID / NAVER_CLIENT_SECRET |
| Instagram 채널 | https://marketing-allinone.vercel.app/api/connect/instagram/callback | Vercel META_APP_ID / META_APP_SECRET |
| Facebook 페이지 읽기 전용 | https://marketing-allinone.vercel.app/api/connect/facebook/callback | Vercel FACEBOOK_APP_ID / FACEBOOK_APP_SECRET |
| Threads 읽기 전용 | https://marketing-allinone.vercel.app/api/connect/threads/callback | Vercel THREADS_APP_ID / THREADS_APP_SECRET |
| Google Business Profile 채널 | https://marketing-allinone.vercel.app/api/connect/google_business/callback | Vercel GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET |

회원 로그인 공급자의 앱·scope·콜백과 채널 운영 권한을 혼동하지 않는다. Naver 로그인은 블로그/플레이스 게시 권한이 아니고 Google OAuth Secret은 Gemini API 키가 아니다. Facebook/Threads 읽기 전용 OAuth를 구현했다. 운영 전용 앱 자격증명 등록·앱 심사·실제 인증은 아직 완료하지 않았다. 게시 권한과 실제 게시 성공을 의미하지 않는다.

## 회원 로그인 준비

- Google/Kakao 개발 콘솔에서 실제 운영자 소유 앱과 운영 콜백, 필요한 회원 프로필 항목, 동의화면·테스트/공개 조건을 확인한다. 소셜 공급자는 현재 운영 Auth 설정에서 비활성이다. 새 가입·인증을 사용자에게 재요청하지 않는다.
- Naver는 자체 `/auth/naver/start` 및 `/auth/naver/callback` 흐름으로 검증한다. 공식 문서: https://developers.naver.com/docs/login/api/api.md
- Supabase Site URL과 허용 Redirect URLs는 실제 운영 프로젝트에서 확인한다. 운영 Auth 콜백은 https://marketing-allinone.vercel.app/auth/callback 이며 로컬 테스트 주소를 운영 등록과 혼동하지 않는다.
- 기존 안내의 확인메일 OFF 권장은 철회한다. 운영 확인메일을 임의로 끄지 않으며 정식 SMTP 준비와 가입/복구 메일 실제 수신·화면 복귀를 검증한다. 기본 발송기의 제한을 성공 1건으로 해소됐다고 판단하지 않는다.

## 적용·검증

비밀값은 채팅/소스/명령 인자에 남기지 않고 승인된 설정 위치로만 전달한다. 키 등록·Provider 활성화·권한/DB 변경·배포는 이번 준비에서 수행하지 않았다. 설치 후 고객 OAuth 왕복, 거절/만료 처리, 계정 소유권, 일반 사용자 범위, 해제와 실제 외부 동작을 별도로 검증한다. 최신 읽기 전용 확인: 프로젝트 루트에서 `node --import tsx backend/src/check-channel-setup.ts --vercel`.
