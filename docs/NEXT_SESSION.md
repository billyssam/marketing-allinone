# 다음 세션 시작점 (2026-08-04 화요일 이어서)

> 마지막 작업: 2026-08-03. HEAD `bea1018`. git 클린·전부 푸시·이슈 0·테스트 82 pass.
> 라이브: https://marketing-allinone.vercel.app · DB: Supabase `exmbpietyadkjnunrhka`
> 로컬: `cd web && npm run dev` (3500) 또는 preview `marketing-all-in-one`

## 🚨 유일한 블로커 — 사장님 액션 1건 (SQL)

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
