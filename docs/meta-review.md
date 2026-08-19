# Meta 앱 심사 제출 키트 (인스타그램 자동 발행)

> **왜 지금 준비하나**: 심사 리드타임이 **4~6주**다. 오늘 신청해도 9월 말~10월 초에 승인된다.
> 로드맵의 "2026-09-30까지 인스타 자동 발행"은 **지금 신청해도 빠듯하다.**
> 코드는 심사가 끝나야 쓸 수 있으니, 사장님이 눌러야 하는 것만 최대한 줄여 여기 모았다.

---

## 0. 지금 상태 (정직하게)

| 항목 | 상태 |
|---|---|
| 발행 어댑터 (`backend/src/channels/instagram.ts`) | ✅ 있음 (미디어 컨테이너 → publish 2단계) |
| **OAuth 연결 흐름** | ❌ **없음** — 토큰을 받을 방법이 없어 발행을 시험조차 못 함 |
| 데이터 삭제 콜백 | ✅ `/api/meta/data-deletion` — 단위 6종 + **로컬 실호출 검증** (아래) |
| 삭제 확인 페이지 | ✅ `/legal/data-deletion` |
| 개인정보처리방침 / 이용약관 | ✅ `/legal/privacy` · `/legal/terms` |

OAuth 흐름은 **App ID·Secret이 있어야 만들고 시험할 수 있다** → 아래 1단계가 끝나면 바로 붙인다.

### 삭제 콜백 실검증 (2026-08-19)

시크릿을 넣고 실제로 호출해 본 결과:

| 요청 | 결과 |
|---|---|
| 올바른 서명 | `200` + `{url, confirmation_code}` (Meta 규격) |
| 다른 시크릿으로 위조 | `400 invalid_signed_request` |
| `algorithm: none` 우회 시도 | `400` |
| 깨진 입력 | `400` |

운영에는 아직 `META_APP_SECRET`이 없어 **503**을 준다 — 키 없이 200을 주면
"삭제했다"고 거짓말하는 셈이라 일부러 실패시킨다. 앱 시크릿을 Vercel 환경변수에 넣으면 바로 산다.

---

## 1. 사장님이 해야 하는 것 (순서대로)

### ① Meta 개발자 앱 생성 — 10분
1. https://developers.facebook.com/apps → **앱 만들기**
2. 유형: **비즈니스**
3. 앱 이름: `마케팅올인원` (또는 원하는 이름)
4. 만든 뒤 **앱 ID**와 **앱 시크릿**(설정 → 기본 설정)을 알려주세요.

> 이 두 값만 주시면 제가 OAuth 연결 흐름을 만들고 시험까지 끝냅니다.

### ② 앱 기본 설정에 주소 등록 — 3분
설정 → 기본 설정에 아래를 그대로 넣습니다.

```
개인정보처리방침 URL:  https://marketing-allinone.vercel.app/legal/privacy
서비스 약관 URL:       https://marketing-allinone.vercel.app/legal/terms
데이터 삭제 요청 URL:  https://marketing-allinone.vercel.app/api/meta/data-deletion
앱 도메인:             marketing-allinone.vercel.app
카테고리:              비즈니스 및 페이지
```

### ③ 비즈니스 인증 — 서류 필요, 심사 1~3일
설정 → 비즈니스 인증. **사업자등록증**과 사업장 주소 확인이 필요합니다.
이게 끝나야 `instagram_business_content_publish` 심사를 넣을 수 있습니다.

### ④ 인스타그램 계정 준비 — 5분
자동 발행은 **프로페셔널(비즈니스) 계정**만 됩니다.
- 인스타 앱 → 설정 → 계정 유형 → **비즈니스로 전환**
- 페이스북 페이지와 연결 (Meta가 요구하는 구조)

### ⑤ 심사 제출 — 아래 3·4번 내용을 붙여넣으면 됩니다

---

## 2. 신청할 권한

| 권한 | 왜 필요한가 |
|---|---|
| `instagram_business_basic` | 연결된 비즈니스 계정 식별·프로필 확인 (어느 계정에 올릴지 정하려면 필요) |
| `instagram_business_content_publish` | 사장님이 승인한 게시물을 그 계정에 올리기 |

> 그 외 권한은 신청하지 않는다. **필요 없는 권한을 끼워 넣으면 심사가 길어지거나 반려된다.**

---

## 3. 권한 사용 사유서 (영문 — 제출 폼에 그대로)

> 심사는 영어로 진행된다. 아래를 그대로 붙여넣되, 앱 이름만 실제 이름으로 바꾼다.

### instagram_business_basic

```
Our app helps small business owners in South Korea (cafes, hair salons, bakeries,
academies) run their marketing. Every morning we generate a ready-to-publish post
for each connected channel using the store's real information (menu items, prices,
opening hours) that the owner registered.

We request instagram_business_basic to identify which Instagram Business account
the owner has connected, show its username in our dashboard so the owner can confirm
they are publishing to the right account, and verify the account is a Professional
account (required for publishing).

We do not read other people's media, comments, or follower data.
```

### instagram_business_content_publish

```
Owners review the generated caption in our dashboard and press "Publish". We then
create a media container and publish it to their own Instagram Business account.

Nothing is published without an explicit action by the account owner in our app.
There is no bulk or automated posting to accounts other than the owner's own.
The owner can disconnect at any time in Settings, and disconnecting immediately
deletes the stored access token.

This permission is the core of our product: without it, owners must copy and paste
every post by hand, which is exactly the burden our service exists to remove.
```

### 데이터 사용·보관 (Data Handling 항목)

```
We store only: the Instagram Business account ID and the long-lived access token,
both used solely to publish posts the owner has approved.

We never store Instagram media, comments, or follower information.

Deletion: owners can disconnect in Settings (token deleted immediately), delete
their account in Settings (all data removed), or use Facebook's app removal — we
implement the Data Deletion Request Callback at
https://marketing-allinone.vercel.app/api/meta/data-deletion
which verifies the signed_request with HMAC-SHA256 and removes the connection.
```

---

## 4. 스크린캐스트 시나리오

> 심사에서 **가장 자주 반려되는 이유가 영상 부실**이다.
> "권한이 실제로 어떻게 쓰이는지"가 처음부터 끝까지 한 번에 보여야 한다. 편집으로 끊지 말 것.

한 번에 촬영 (2~3분, 소리 없어도 됨. 화면에 영어 자막 권장):

1. 로그인 화면 → 사장님 계정으로 로그인
2. **채널 연결** 화면에서 인스타그램 [연결] → Meta 로그인 → 권한 동의 화면
   → **동의 후 우리 대시보드로 돌아와 계정 이름이 표시되는 것**까지 (여기가 `basic` 사용 장면)
3. 대시보드에서 **오늘 생성된 인스타 캡션**을 보여줌 (스크롤해서 내용이 보이게)
4. [게시] 버튼을 누름 → 성공 표시
5. **인스타그램 앱/웹으로 전환해 방금 올라간 게시물을 보여줌** (여기가 `content_publish` 사용 장면)
6. 다시 우리 앱 → 설정 → [연결 해제] → 연결이 끊긴 상태 표시

**주의**
- 2번에서 권한 동의 화면이 반드시 화면에 보여야 한다(넘기면 반려된다).
- 5번에서 실제 인스타 게시물이 보여야 한다. 스크린샷 대체 불가.
- 테스트 계정이 아니라 **실제 비즈니스 계정**으로 촬영할 것.

## 5. 리뷰어용 테스트 계정

제출 폼에 아래를 적는다. (심사관이 직접 들어와 본다)

```
Test account:  (심사 직전에 발급 — invite-owner.ts로 생성)
Password:      (동일)
Notes: After login, the dashboard shows today's generated posts. The Instagram
connection is on the Channels page. A pre-connected test store is available.
```

> ⚠️ 심사관은 **한국어 화면**을 본다. 주요 버튼 옆에 영어 툴팁이 없으면
> "무엇을 눌러야 하는지 모르겠다"로 반려된 사례가 있다 → 제출 전 영어 안내문을 함께 적을 것.

---

## 6. 반려 대비 (백업 경로)

로드맵에도 적혀 있듯 **인스타 반자동(블로그와 같은 붙여넣기)** 경로가 이미 동작한다.
심사가 지연·반려되어도 사장님은 오늘도 인스타에 올릴 수 있다 —
자동 발행은 "손이 덜 가는 것"이지 "없으면 못 쓰는 것"이 아니다.

그러니 **심사 결과를 기다리며 파일럿을 멈추지 않는다.**
