# 운영자가 한 번만 하는 일

## 2026-10-08 고객 여정 출시 조건

`CUSTOMER_JOURNEY_AUDIT.md`를 먼저 읽는다. 가입 확인 메일은 QA 주소에서 수신·인증했으나 복구 요청은 대기 후에도 발송 제한이다. Auth SMTP·발송 제한을 확인하고 운영 발송 계정과 도메인을 준비한 뒤 일반 고객 주소의 가입·복구 수신을 검증해야 한다. 고객에게 발송 계정 설정을 맡기지 않는다. 현재 SMTP 구성을 읽지 못했으므로 기본 SMTP 사용 여부를 단정하지 않는다.

PC 확장은 선택 기능이며 `web/public/marketing-allinone-extension.zip`으로 배포한다. extension 소스를 수정하면 저장소 루트에서 아래 명령으로 다시 묶어 특정 ZIP만 강제 추가한다. ZIP에는 확장 소스만 넣고 환경 파일·비밀값을 포함하지 않는다.

```powershell
Compress-Archive -LiteralPath ./extension -DestinationPath ./web/public/marketing-allinone-extension.zip -Force
git add -f web/public/marketing-allinone-extension.zip
```

AI 실제 생성, 실기기 알림 수신, 외부 게시, 운영자 주간 전달은 별도 실검증 조건이다.

> 🔴 **이 문서의 존재 이유**: 3주 동안 "사장님이 Meta App ID를 주시면"이라고 적어 왔다.
> **틀렸다.** App ID 는 **서비스(우리)가 한 번 등록하는 우리 앱**이고, 고객은 그게 뭔지 평생 모른다.
> 고객은 "인스타 연결" 버튼을 누르고 자기 계정으로 로그인할 뿐이다.
> 이걸 헷갈려서 열 수 있는 채널을 안 열고 있었다.

## 🔒 이 구분은 코드가 지킨다

```bash
cd backend && npx tsx src/check-operator-leak.ts
```

고객 화면(`.tsx`) 전수를 훑어 **운영자 용어**(`App ID`·`client_secret`·`알리고`·`환경변수`·`심사 대기`)를
찾으면 **빌드를 막는다**(`web` 의 `prebuild`). 주석·`process.env` 참조는 제외 —
개발자가 읽는 글은 오히려 거기 있어야 한다.

가드가 걸리면 **문구를 지우지 말고 코드를 옮겨라.** 실제로 그렇게 고쳤다:
환경변수 이름이 `channels/page.tsx` 에 있던 것 → `lib/operator-ready.ts`(server-only)로.

## 누가 무엇을 하는가

| | 운영자(우리) | 고객(사장님) |
|---|---|---|
| Meta 앱 등록·심사 | **한 번** | 안 함 (존재를 모름) |
| Google Cloud 프로젝트 | **한 번** | 안 함 |
| 알림톡 발송 계정(알리고) | **한 번** | 안 함 |
| 인스타·페북·스레드 연결 | — | **버튼 눌러 로그인** |
| 구글 비즈니스 연결 | — | **버튼 눌러 로그인** |
| 스마트스토어 키 | — | **판매자센터에서 발급해 입력** |
| 카카오 채널 | — | **자기 채널 아이디 입력** |

고객에게 우리 사정(심사 진행 상황·App ID)을 화면에 적지 않는다.
못 여는 채널엔 "곧 열려요"라고만 쓴다 — 알아도 고객이 할 수 있는 게 없다.

## 1. Meta 앱 (현재 OAuth 구현은 인스타그램)

```
https://developers.facebook.com/apps
```

1. 앱 만들기 → 유형 **비즈니스**
2. 제품 추가 → **Instagram** · **Facebook 로그인**
3. 현재 구현은 **Facebook Login** 경로다. 권한은 코드 `shared/channels/oauth-config.ts`와 일치시킨다: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `business_management`. Instagram Login 경로의 다른 권한 이름과 섞지 않는다.
4. 앱 심사 제출. 승인 일정은 Meta에서 확인한다. 자료는 `docs/meta-review.md`를 현재 경로와 대조한다.
   (데이터 삭제 콜백은 이미 구현·검증 완료: `/api/meta/data-deletion`)

받은 값을 Vercel 환경변수에:

```
META_APP_ID · META_APP_SECRET
```

이 둘이 들어가면 인스타 **계정 연결** 버튼을 제공한다. 콜백은 권한과 비즈니스 계정 ID를 실제 조회한다.
Facebook·Threads는 각 채널의 인증·어댑터 구현 전까지 연결 완료로 표시하지 않는다.
계정 연결과 자동 게시는 별도다. 현재 자동 게시 스케줄러의 운영 완주는 미검증이다.

## 2. Google Cloud (구글 비즈니스 프로필)

```
https://console.cloud.google.com/apis/credentials
```

OAuth 클라이언트 ID 생성 → Business Profile API 접근 신청(승인 필요).

```
GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET
```

## 3. 알림톡 발송 계정

```
https://smartsms.aligo.in/
```

우리 계정 하나로 전 고객에게 보낸다. 고객은 **자기 카카오 채널 아이디**만 입력한다.

```
ALIGO_API_KEY · ALIGO_USER_ID
```

⚠️ 템플릿 심사 2주. 템플릿은 우리가 등록한다(고객이 하지 않는다).

## 4. 웹 푸시와 주간 전달

- 2026-10-08: VAPID 키를 발급하여 기존 로컬 비밀 파일과 GitHub/Vercel Production에 등록했다. 키를 다시 발급해 덮어쓰면 기존 구독을 쓸 수 없으므로 임의 회전하지 않는다.
- GitHub: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` secrets와 `VAPID_SUBJECT` variable.
- Vercel: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`(공개 Config), `VAPID_PRIVATE_KEY`(Secret), `VAPID_SUBJECT`(사이트 URL).
- 새 배포 후 고객이 기기에서 알림을 켜야 실제 발송 대상이 생긴다. 구독 없음은 발송 성공이 아니다.
- 주간 전달은 운영자의 `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID`가 필요하다. 설정·실제 전달 확인 전에는 준비 완료로 평가하지 않는다. 비밀값은 저장소 문서나 공개 로그에 남기지 않는다.

## 현재 외부 설정 미완료

```bash
cd backend && npx tsx src/audit-channels.ts
```

10월 8일 확인한 Production에는 Meta·Google OAuth·알림톡 운영 자격증명이 없다.
`audit-channels.ts`는 과거 경로/판정을 포함하므로 단독 출시 근거로 쓰지 않는다.

운영 앱 설정과 실제 계정 연결을 마친 뒤, 외부 게시 결과까지 따로 확인한다.
