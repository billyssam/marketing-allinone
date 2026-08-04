# 다음 세션 시작점 (2026-08-05 수요일 이어서)

> 마지막 작업: 2026-08-04. HEAD `00ee911` (6커밋). git 클린·전부 푸시·테스트 86 pass·
> 백엔드/웹 tsc 클린·프로덕션 빌드 28페이지 성공·`/api/health` ok:true.
> 라이브: https://marketing-allinone.vercel.app · DB: Supabase `exmbpietyadkjnunrhka`
> 로컬: `cd web && npm run dev` (3500) 또는 preview `marketing-all-in-one`
>
> **열려 있는 이슈 1건 = "🔴 인증 설정 문제"** — 버그가 아니라 아래 블로커 1·2를
> 매일 05:30 점검이 정확히 잡아낸 것. 사장님이 대시보드에서 고치면 자동으로 닫힌다.

## 🔜 내일 첫 순서

1. 사장님이 아래 블로커 3건 처리 (Supabase 대시보드).
2. 처리 후 즉시 확인: `cd backend && npx tsx src/check-auth-config.ts` → 2항목 ✅,
   그리고 `npx tsx src/generate-daily.ts --force` → "저장 스킵" 없이 4채널 생성.
3. 1·2가 풀리면 **비밀번호 재설정 메일 실물 왕복 테스트**(지금은 링크가 localhost로
   가서 검증 자체가 불가능한 상태 — 코드는 신규 컨텍스트 6/6 검증 완료).
4. 그다음 후보는 아래 "다음 후보" 참고.

## 🚨 파일럿(8/20) 블로커 — 사장님 액션 3건

> 셋 다 Supabase 대시보드 작업. 코드는 전부 준비돼 있고 설정만 바뀌면 즉시 살아난다.
> 매일 05:30 `auth-config-check`가 1·2번을 실측해 이슈로 울린다.

### 1. 🔴 리다이렉트 허용목록 (가장 급함 — 인증 전체가 깨져 있음)

Supabase가 **허용목록에 없는 주소를 에러 없이 Site URL로 바꿔치기**한다.
실측: 운영 주소를 넘겼는데 `redirect_to=http://localhost:3000`이 돌아왔다.
→ 비밀번호 재설정 메일·가입 확인 메일·향후 카카오/구글 OAuth 콜백이 **전부 죽은 링크**.
앱은 200을 뱉고 헬스체크도 통과하므로 화면으론 절대 안 보인다.

**Authentication → URL Configuration**
- Site URL = `https://marketing-allinone.vercel.app`
- Redirect URLs에 `https://marketing-allinone.vercel.app/**` 추가

확인: `cd backend && npx tsx src/check-auth-config.ts` → 허용목록 항목 ✅

### 2. 🔴 메일 도달 (사장님 자가가입이 막혀 있음)

내장 메일 서비스 = 프로젝트 전체 **시간당 2통** + 팀 외 주소 발송 거부.
확인메일 ON이라 사장님이 가입 버튼을 누르면 `429 over_email_send_rate_limit` →
**계정조차 생성되지 않는다**(실측).

- 근본 해결: 커스텀 SMTP(Resend — CARTON 홈페이지에서 이미 쓰는 그것) 연결 후
  repo variable `CUSTOM_SMTP_CONFIGURED=true`
- **그때까지 파일럿은 초대 방식으로 진행 가능(이미 구현·E2E 검증 완료)**:
  `cd backend && npx tsx src/invite-owner.ts <이메일> <이름>` → 카톡 안내문 출력

### 3. 4채널 DB enum (SQL)

플레이스·당근·밴드·카카오채널 4채널이 **코드는 배포 완료, DB enum만 대기** 중입니다.
SQL 실행 즉시 재배포 없이 다음 크론부터 자동 생성됩니다.

- 운영 프로젝트 ref = `exmbpietyadkjnunrhka` (`.env.local` URL이 단일 진실)
- ⛔ paused된 "marketing-allinone"은 7/9에 버린 옛 것 — **Resume 금지**(과금)
- 두 프로젝트 **이름이 동일**하므로 구분은 ref로만
- 계정 찾기: Gmail `from:supabase` / `chrome://password-manager/passwords`

```sql
alter type post_channel add value if not exists 'naver_place';
alter type post_channel add value if not exists 'danggeun';
alter type post_channel add value if not exists 'naver_band';
alter type post_channel add value if not exists 'kakao_channel';
```
확인: `cd backend && npx tsx src/generate-daily.ts --force` → "저장 스킵" 없이 채널 전부 생성되면 성공.

## 세션 시작 5분 점검

1. `gh run list --limit 10` / `gh issue list --state open` (비어야 정상)
2. 어제 넣은 수정이 크론 산출물에 반영됐는지 (제목 프리픽스 0·반복시어 0·threads 200자+)

## 2026-08-04 한 것 (인증 + 범용성)

- `d854fab` **비밀번호 재설정 신설** — 아예 없었음. 소셜 로그인이 꺼져 있어 이메일이
  유일 진입로라, 비번 잊은 사장님은 영영 못 들어오는 상태였다.
- `8f7401b` **인증 경로가 운영에서 통째로 깨져 있던 것 발견**(위 블로커 1·2) +
  우회로 `invite-owner.ts`(메일 없이 계정 개통, E2E 4/4) + 매일 05:30 감시 워크플로.
  pilot-kit의 "링크에서 이메일로 가입" = 못 지키는 약속이라 초대 절차로 교체.
- `6710ef3` **비음식 업종에서 가격이 하나도 안 잡히던 것 수정** — 검증이 카페 한 곳뿐이었다.
  미용실·헬스장·네일샵 홈에는 메뉴 링크가 0개고 가격은 별도 `/price` 탭에 있었다.
- **범용성 E2E 실측**: 준오헤어 크롤 16건 → 블로그 초안 2,573자,
  **실제 시술·가격 12건 인용**(남성컷 35,000·셋팅펌 250,000),
  어휘도 "메뉴" 0회 / "시술" 3회로 업종에 맞게 나옴. 쿵더쿵 회귀 없음.
- `5bb06bd` 🔴 **미용실 칭찬이 부정 알림으로 가던 것** — `머리카락`·`위생`이 강한부정에
  단독으로 있어서 "머리카락이 상했는데 살려주셔서 감사해요"가 negative로 뒤집혔다.
  실리뷰 49건 재측정: 카페 9/9·미용실 10/10·네일 10/10·헬스 10/10·정형외과 9/10.
- `00ee911` 제목 few-shot 예시 6종이 전부 카페였던 것 → 업종별 4종으로 분리.
- **교훈**: 범용성 결함은 한 곳에 안 몰려 있다. 크롤 → 감정분석 → 프롬프트 예시까지
  층마다 음식 기준이 박혀 있었고, 각 층을 **실제 비음식 업체로 실측해야만** 드러났다.
  새 기능을 넣을 때마다 "카페 말고 미용실이면?"을 한 번씩 돌려볼 것.

## 2026-08-03 한 것 (5커밋 + 검증 3건)

- `07caf3c` 일주일 실물 검증 후속 4종: 반복시어 문턱 1회로·프리픽스 첫어절 제약·
  threads brief 모순 수정·**조용한 실패 로그화 → Gemini 503 발견 → 재시도 추가**
- `eda2215` 미답 리뷰 우선 로딩(오래된 미답이 목록 밖으로 밀리던 문제)
- `70a157f` 단골 목록 40명씩 + 더 보기(212장 동시 렌더 해소)
- `3d2d240` 글 보관함 카운트·필터 전체 기준(200건 초과 시 숫자 틀어짐)
- `bea1018` 웰컴 드래프트 "지연" 오탐 방지(실측 36초 vs 임계 45초)
- 검증만 한 것: 채널 연결→생성→해제→중단 E2E · **멀티매장 크론(4매장 181초 실패0)** ·
  첫날 여정 모바일 완주

## 다음 후보 (우선순위)

1. **SQL 실행 후 4채널 실물 검증** — 플레이스 소식·당근 글 품질, /prepare 흐름.
2. **주간 리포트** — 사장님이 "이번 주 이렇게 했어요"를 체감할 요약(성과 체감 = 파일럿 유지율).
3. **파일럿 초대 리허설** — pilot-kit.md 문구로 실제 초대 → 가입 → 첫 주 흐름 점검.
4. 스마트플레이스 답글 딥링크 실계정 검증(파일럿 첫날 항목).

## 외부 게이트 (사장님이 필요할 때)

카카오/구글 OAuth(`docs/oauth-setup.md`) · Gemini 유료(6~8매장 초과 시) · 확인메일 OFF ·
알림톡 credential(현재 sms: 1탭으로 대체 가능) · 운영자 텔레그램 토큰

## 주의사항 (실제로 겪은 것)

- 🚫 옛 Supabase `oricgerprwgijnowjokn` resume 금지
- PS5.1: 커밋 메시지에 따옴표·괄호 있으면 `git commit -F <파일>`
- **Windows `pkill -f`는 next 프로세스를 못 죽인다** → `Get-NetTCPConnection -LocalPort N | Stop-Process`
  (안 죽이면 옛 빌드가 서빙돼 "수정이 반영 안 된 것처럼" 보임)
- **판정은 항상 DB 원문으로** — /prepare 미리보기는 500자 클램프, 생성은 30초+ 걸림.
  화면 스냅샷 하나로 "실패"라 결론짓지 말 것(오늘 두 번 오판했다가 재확인으로 정정)
- 단일 관측이 다른 증거와 모순되면 결론 전에 재확인(`select industries` 0행 → 실제 45행)
- Gemini flash 무료 20회/일 — 실측 많이 하면 소진돼 lite 폴백. 중요 검증은 오전에
- 테스트 계정은 검증 후 반드시 정리
