# Facebook·Threads 운영 연결 준비

갱신: 2026-10-27. 계정 연결은 읽기 전용이며 실제 게시 기능·게시 권한은 포함하지 않는다. 운영 코드 배포와 일반 고객 외부 인증 성공을 따로 판정한다. 현재 운영 자격증명은 미등록이고 Chrome이 필요한 실제 개발자 콘솔 작업은 사용자 지시로 연기돼 있다.

## 운영 앱 등록에 넣을 값

| 항목 | Facebook | Threads |
| --- | --- | --- |
| 앱 표시 이름 | 마케팅올인원 | 마케팅올인원 |
| 홈페이지 | https://marketing-allinone.vercel.app | 동일 |
| 정확한 HTTPS OAuth 콜백 | https://marketing-allinone.vercel.app/api/connect/facebook/callback | https://marketing-allinone.vercel.app/api/connect/threads/callback |
| 서버 전용 환경변수 | FACEBOOK_APP_ID, FACEBOOK_APP_SECRET | THREADS_APP_ID, THREADS_APP_SECRET |
| 현재 코드의 요청 범위 | pages_show_list, pages_read_engagement | threads_basic |
| 계정 식별 | 고객이 관리 페이지를 명시 선택, 페이지 토큰 ID 일치 확인 | 토큰 교환의 사용자 ID와 /me ID 일치 확인 |
| 코드 API 주소 | graph.facebook.com/v26.0 | graph.threads.com/v1.0 |
| 개인정보 URL | https://marketing-allinone.vercel.app/legal/privacy | 동일 |
| 삭제 방법 안내 URL | https://marketing-allinone.vercel.app/legal/data-deletion | 동일 |
| 운영 지원 이메일 | billy5285@gmail.com | 동일 |

도메인 입력란의 구체적인 등록 허용 방식과 소유권 요구는 실제 콘솔에서 확인한다. vercel.app 전체 도메인을 소유했다고 주장하지 않는다. 위 값은 코드와 운영 주소에서 준비한 값이며 해당 앱 콘솔에 저장됐다는 뜻이 아니다. Threads는 해당 앱의 Threads 전용 ID·Secret을 사용하고 기존 Instagram META_APP_SECRET을 자동 복사하지 않는다. Facebook 변수도 명시적으로 검증한 앱 쌍을 등록해야 한다.

## 앱 권한 심사 설명 초안

서비스는 소상공인 회원이 직접 연결한 본인 채널의 계정과 접근 권한을 확인하고 콘텐츠 초안을 관리한다. Facebook은 관리 페이지 목록을 표시하여 회원이 페이지를 고르고, 선택한 페이지 토큰의 ID를 다시 확인한다. Threads는 회원의 계정 ID를 확인한다. 이번 버전은 글을 외부에 게시하거나 메시지를 전송하지 않는다. 게시 권한을 승인받았다고 설명하지 않는다.

필요한 증빙은 실제 앱에서 허용된 테스트 계정의 권한 허용·거절, 다중 Facebook 페이지 선택, 계정 확인, 연결 해제까지의 화면이다. 아직 실제 OAuth 녹화·일반 고객 심사 승인을 만들지 못했다. 앱 역할 사용자 성공과 일반 고객 공개 승인을 구분한다. 사업자·소유자·테스트 사용자 정보는 확인한 사실만 입력한다.

## 개인정보·삭제 준비

개인정보 안내에는 연결 식별자·접근 토큰·만료 정보·권한 확인 목적, Facebook 선택용 암호화 임시 쿠키10분, 로컬 연결 해제의 범위가 반영된다. 공개 삭제 안내는 실제 처리 이력 없이 완료라고 표시하지 않는다. 서비스의 연결 해제는 토큰·식별자·만료 정보를 지우며 외부 플랫폼의 앱 권한 철회와 다르다.

기존 /api/meta/data-deletion은 META_APP_SECRET과 Instagram external_id를 사용하는 이전 콜백이다. 이를 Facebook·Threads 전용 삭제 콜백으로 등록하지 않는다. 플랫폼 콘솔이 삭제 안내 URL 대신 자동 삭제/권한철회 콜백을 요구하면 해당 앱 사용자와 저장된 채널 ID의 매핑·서명 검증·삭제 처리 검증이 완료될 때까지 활성화 보류한다. 정적 안내 URL만으로 모든 심사 요건이 충족됐다고 선언하지 않는다.

## 비밀값 설치와 실제 확인 순서

1. 개인 마케팅올인원 앱 소유권, 앱 제품, 앱 역할·공개 상태, 실제 사용할 테스트 채널과 허용 범위를 콘솔에서 확인한다.
2. 위 정확한 콜백과 최소 요청 권한을 등록한다. 실제 콘솔의 App Review/접근 수준·추가 의존 권한 요구를 확인한다. 직접 문서429 실패를 승인 완료로 해석하지 않는다.
3. 확인된 ID/Secret 쌍만 Vercel의 marketing-allinone 프로젝트 production 서버 변수에 Secret 경로로 입력한다. 소스·채팅·명령 인자·인수인계·브라우저 클라이언트·로그에 원문이나 지문을 남기지 않는다. 빈 템플릿 일괄 업로드 금지.
4. 환경변수는 새로운 배포에서 적용되므로 해당 배포의 SHA와 기본 운영 도메인을 다시 확인한다. 요청 범위가 바뀌면 기존 토큰의 권한도 재검증한다.
5. 최소 가상 QA로 로그인→채널→외부 허용→정확한 계정/페이지 선택→고객 채널 복귀→새로고침 유지→권한 재확인을 수행한다. 거절·만료·권한 부족·다른 매장 접근·위조state가 연결 성공을 만들지 않아야 한다.
6. Threads 토큰 갱신은 발급 하루 이후·만료 전 실제로 확인한다. 만료된 토큰은 재연결한다. 갱신 도중 해제한 연결이 다시 살아나면 실패다.
7. 우리 앱 연결 해제와 외부 앱 권한 철회를 각각 확인한다. QA 전역 세션 종료·관련 테스트 행 정리를 확인한다. 실제 고객 데이터는 사용하지 않는다.

현재 활성화 보류 사유: 네 전용 환경변수 부재, 해당 앱 소유권·역할/심사·정식 테스트 채널 미확인, 실제 OAuth 왕복/계정 조회·갱신·해제 미검증. 사용자에게 새 가입·본인인증·Chrome 재연결을 반복 요청하지 않는다. Gemini 키 교체는 보류 상태로 유지한다.

## 준비 완료 판정과 재점검

코드 준비: 전체277개 가상 데이터 테스트·타입검사·빌드 통과, 새 토큰 가상 문자열 정리 후 추가12개 테스트 통과. 운영 반영은 배포 기록과 운영 도메인의 응답으로 따로 기록한다. 실제 외부 연결 성공은 위 고객 왕복 증거가 있어야 한다.

읽기 전용 재고: `node --import tsx backend/src/check-channel-setup.ts --vercel`. 값이 아닌 존재 플래그와 콜백/코드 scopes만 기록한다. 보고서 docs/CHANNEL_SETUP_INVENTORY_2026-10-27.json. 빈 서버 변수 템플릿 docs/channel-production.env.example.

## 공식 근거와 확인 한계

- https://raw.githubusercontent.com/facebook/facebook-nodejs-business-sdk/main/src/api.js — 공식 SDK 기본 v26.0 확인. 이것만으로 해당 앱의 모든 권한/심사 조건을 확인한 것은 아니다.
- https://raw.githubusercontent.com/fbsamples/threads_api/main/README.md — Threads 전용 App ID/Secret과 정확한 HTTPS 콜백, localhost 제한. 샘플은 모든 최신 기능을 담지 않는다고 명시한다.
- https://raw.githubusercontent.com/fbsamples/threads_api/main/src/index.js — Threads OAuth 및 장기 토큰 교환 예시.
- https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api — Meta 공식 Threads API 컬렉션.
- https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api — Meta 공식 Facebook API 컬렉션.
- https://developers.facebook.com/docs/threads/get-started/ , https://developers.facebook.com/docs/pages-api/getting-started/ — 2026-10-27 재조회도429로 확인 실패. 계정별 활성화 조건은 실제 콘솔에서 확인해야 한다.
