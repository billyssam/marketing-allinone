# 다음 세션 시작점 (2026-08-03 월요일 이어서)

> 마지막 작업: 2026-07-27. HEAD `d47ef75`. git 클린·전부 푸시·알림 이슈 0·테스트 79 pass.
> 라이브: https://marketing-allinone.vercel.app · DB: Supabase `exmbpietyadkjnunrhka`
> 로컬: `cd web && npm run dev` (3500) 또는 preview `marketing-all-in-one`

## 🚨 가장 먼저 — 사장님 액션 1건 (유일한 블로커)

**Supabase SQL 실행**이 안 되면 네이버 플레이스·당근·밴드·카카오채널 글이 안 나옵니다.
코드는 이미 배포돼 대기 중이라 **SQL만 실행하면 재배포 없이 다음 크론부터 자동 생성**됩니다.

문제: 사장님 로그인 계정에 **옛 프로젝트(paused)만** 있고 운영 프로젝트는 **별도 무료 계정**에 있음.
- 운영 ref = `exmbpietyadkjnunrhka` (`.env.local`의 URL이 단일 진실)
- ⛔ paused된 "marketing-allinone"은 7/9에 버린 옛 것 — **Resume 절대 금지**(과금 시작)
- 두 프로젝트 **이름이 똑같아서** 구분은 ref로만 가능
- 계정 찾기: Gmail `from:supabase` 검색 / `chrome://password-manager/passwords`

실행할 SQL (SQL Editor):
```sql
alter type post_channel add value if not exists 'naver_place';
alter type post_channel add value if not exists 'danggeun';
alter type post_channel add value if not exists 'naver_band';
alter type post_channel add value if not exists 'kakao_channel';
```
실행 후 확인: `cd backend && npx tsx src/generate-daily.ts --force` → 로그에 "저장 스킵" 없이 9채널 생성되면 성공.

## 세션 시작 5분 점검

1. `gh run list --limit 15` / `gh issue list --state open` (실패 시 자동 이슈 → 비어야 정상)
2. **주말 크론 실물 검증**: 오늘 넣은 수정들이 실제 생성물에 반영됐는지 DB로 확인
   - 제목: 프리픽스("옥천 안내면 쿵더쿵,") 재발 없는지 + `metadata.titleStyle` 기록 확인
   - 분량: medium 1600자+ / long 1900자+
   - 캡션: 채널별 하한 충족(인스타 300+·페북 400+ 등), 날조 숫자 경고 로그 없는지

## 2026-07-27 한 것 (11커밋)

콘텐츠 엔진 결함 8종 + PWA + 수치 정합 + 운영 스크립트 수정:
- `9d7df4f` 제목 규칙 유실 수정(기획 단계에서 소실 → 본문 단계 직결 + few-shot)
- `c778ae4` long 분량 현실화(2200→1900, 과한 목표가 역효과) + 제목 계절 가드
- `78090ea` 🔴 **네이버 플레이스 콘텐츠 영구 누락 수정** + 채널별 저장 실패 격리
- `20cb720` 밴드·카카오채널 네이티브 톤
- `ad682c0` 27채널 전수 감사(복붙 발행·거짓 등급·사실 날조 3종)
- `de60571` 다채널 연결 시 캡션 급감 수정(하한 명시 + maxOutputTokens)
- `1828663` PWA 서비스 워커(앱 설치 요건 충족 + 오프라인)
- `7efda5d` 리뷰 수치 화면 간 불일치 수정(count 기반 전체 집계)
- `d47ef75` check-morning-ready dotenv 누락 수정

## 다음 후보 (우선순위)

1. **SQL 실행 후 4채널 실물 검증** — 플레이스 소식·당근 글이 실제로 나오는지, /prepare 흐름까지.
2. **온보딩 채널 추천 재점검** — status 재분류(live 6채널) 후 신규 가입자에게 어떤 채널이 추천되는지 실측.
3. **리뷰 목록 미답 우선 로딩** — 현재 최신 100건만 가져와서 오래된 미답 리뷰가 안 보임(요약 수치는 정확).
4. 스마트플레이스 답글 딥링크 실계정 검증(파일럿 첫날 항목).

## 외부 게이트 (사장님이 필요할 때)

카카오/구글 OAuth(`docs/oauth-setup.md`) · Gemini 유료(6~8매장 초과 시) · 확인메일 OFF ·
알림톡 credential(지금은 sms: 1탭으로 대체 가능) · 운영자 텔레그램 토큰

## 주의사항

- 🚫 옛 Supabase `oricgerprwgijnowjokn` resume 금지
- PS5.1: 커밋 메시지에 따옴표·괄호 있으면 `git commit -F <파일>`
- **Windows에서 `pkill -f`는 next 프로세스를 못 죽인다** → `Get-NetTCPConnection -LocalPort N | Stop-Process`
  (안 죽이면 옛 빌드가 계속 서빙돼 "수정이 반영 안 된 것처럼" 보임 — 실제로 겪음)
- 브라우저 검증은 Playwright MCP가 안정적
- 테스트 계정은 검증 후 반드시 정리(크론 쿼터·DB 오염)
- Gemini flash 무료 20회/일 — 실측 많이 하면 소진돼 lite 폴백(품질 낮음). 중요 검증은 오전에.
