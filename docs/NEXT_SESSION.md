# 다음 세션 시작점 (2026-07-27 월요일 이어서)

> 마지막 작업: 2026-07-23. HEAD `96f09a5`. git 클린·전부 푸시·알림 이슈 0.
> 라이브: https://marketing-allinone.vercel.app · DB: Supabase `exmbpietyadkjnunrhka`
> 로컬 실행: `cd web && npm run dev` (port 3500) 또는 preview `marketing-all-in-one`

## 세션 시작하면 먼저 (5분 점검)

1. **주말 크론 확인**: `gh run list --limit 15` — daily-content·review-crawl·morning-ready·uptime 매일 도는지. `gh issue list --state open` 비어야 정상(실패 시 자동 이슈).
2. **콘텐츠 실물 검증(중요)**: 지난주 넣은 3대 콘텐츠 개선이 주말 크론에서 실효했는지 DB로 실측:
   - 제목 8일 반복 → 로테이션(매일 다른 구조·시어 안 겹침)
   - 본문 분량 52% → 목표 근처(medium ~1500자+)
   - 인스타/스레드 한도 이내
   확인법: 쿵더쿵 최근 blog/instagram/threads posts 뽑아 제목 패턴·글자수 대조.

## 지난주(7/22~23) 한 것 — HEAD 기준 최근 15커밋

- 콘텐츠: 제목 결정적 로테이션(`bd81a09`), 본문 분량 강제 52%→96%(`e6a7499`), 캡션 플랫폼 하드트림+해시태그캡(`96f09a5`)
- 온보딩 견고성 3종: 입력 지속성(`2ba96eb`)·플레이스 넛지(`a220b03`)·웰컴 실패 자가복구(`a323723`)
- 성능·접근성: 폰트 다이내믹 서브셋 LCP 13s→4.6s·핀치줌 복원(`a8cbf0b`, 데스크톱 99점)
- 운영: 수동생성 일일상한 8회(`c29de3a`)·demo 리셋 스크립트(`865f876`)·morning-ready 2차스케줄(`82675d4`)
- 데일리 루프 3축 1탭: /prepare·/reviews 답글(`72b1e20`)·/regulars 문자(`3708d59`)
- 전주(7/22): 법적 3종(약관·방침·탈퇴)·24/7 감시 이중화·운영 런북(`docs/ops.md`)

## 다음 후보 (우선순위)

1. **네이버 플레이스·당근 캡션 실물 점검** — 지난주 인스타/스레드만 봄. 나머지 단문 채널도 같은 렌즈로(품질·길이·톤). caption.ts PLATFORM_MAX에 이미 상한 있음.
2. **채널 커버리지 나머지** — 0005 SQL(당근·밴드·카카오채널 enum) 사용자 실행 대기 → 실행되면 CHANNEL_TO_POST·PostChannel·라벨 3곳 추가하면 즉시 발행(포매터·트림 이미 지원).
3. 스마트플레이스 답글 딥링크 실계정 검증(placeId≠비즈니스ID 가능성, 파일럿 첫날 확인 항목).

## 외부 게이트 대기목록 (사용자가 필요할 때 진행 — 막히면 그때 요청)

- 카카오/구글 OAuth 앱등록 (`docs/oauth-setup.md`, 코드 완성) — 가입 문턱↓
- Gemini 유료 전환 — 파일럿 6~8매장 넘으면 필요(flash 20/일)
- Supabase 확인메일 OFF — 초대 문턱↓
- 알림톡 credential — 재방문 자동발송(지금은 sms: 1탭으로 대체 가능)
- 운영자 텔레그램 토큰 (repo 시크릿) — 초안준비·부정리뷰 알림 발송용

## 파일럿 (8/20)

- 초대 키트: `docs/pilot-kit.md` (현행화 완료)
- demo 정리 결정 시: `cd backend && npx tsx src/reset-store-data.ts --wipe-posts --yes` (드라이런 기본·자동백업)
- 운영 대응: `docs/ops.md`

## 주의사항

- 🚫 옛 Supabase `oricgerprwgijnowjokn`(billyssam Org, paused) 절대 resume 금지 — 운영은 `exmbpietyadkjnunrhka`
- PS5.1: 커밋 메시지에 따옴표·괄호 있으면 `git commit -F <파일>` (인라인은 파스 깨짐)
- 브라우저 검증은 Playwright MCP가 브라우저팬보다 안정적
- 테스트 계정 만들면 검증 후 반드시 정리(크론 쿼터·DB 오염 방지)
- 한글 API 테스트는 node fetch로, 커밋 후 배포확인은 번들 내용 비교로
