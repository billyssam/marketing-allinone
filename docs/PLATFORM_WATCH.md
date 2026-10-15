# 공식 플랫폼 변경 추적

최초 기준: [2026-10-13 재점검](PLATFORM_REAUDIT_2026-10-13.md). 마지막 점검: 2026-10-15 KST. 기존 결함은 아래 고정 ID로 상태를 갱신한다. 공식 문서를 읽은 사실과 계정별 실작동·운영 반영은 별개다. P1은 고객 경로 위험, P2는 개선·평가 후보이며 공급자의 등급이 아니다.

## 새로 확보한 근거

**2026-10-15 사용자 요청에 따른 구현/배포 완료:** 당근 소식 한도·비즈프로필 이동/복귀 안내, 소비자 홈 주소 수정, 미검증 당근 원클릭 버튼 제외 및 단골 쿠폰 제공 문구 정정. 기존 1954f8e도 포함한 `f67cc780c158696002d6f4e19de0d566ae03fb96` Production 7080904457 success. 코드 품질 CI 38662121241 및 화면 CI 38662121222 success. 기본 운영 URL의 가상 고객 로그인→초안→클립보드→게시 준비→확인 저장 경로 검증. health 200/ok:true/db:true. 당근 자체는 QR/휴대폰 로그인에서 대기, 실제 작성/게시/노출 미검증. 아래 과거 항목 중 ‘로컬만’은 이 최신 기록과 상태 갱신을 따른다. SDK/Meta/네이버 수집·SMTP 미완료는 유지.

| ID | 공식 근거·발표/시행일 | 영향·조건·중요도 | 대응·기한 | 검증·운영 반영 |
| --- | --- | --- | --- | --- |
| GEM-ARGON | [Gemini 릴리스 노트](https://ai.google.dev/gemini-api/docs/changelog), 2026-10-13 GA 발표. [이전 안내](https://ai.google.dev/gemini-api/docs/latest-model) | P2 평가 후보. `shared/content-engine/gemini-client.ts`, `channel-native.ts`의 초안 생성. 현재 2.5 Flash/Flash-Lite, 출력 상한 8192, temperature 지정. 신규 가이드는 추론 토큰을 포함한 출력 예산 검토 및 sampling 설정 미적용을 안내하므로 모델 이름만 교체하면 품질·응답 길이·비용 보장이 안 된다. 우리 청구 프로젝트의 이용 가능 여부는 미확인. | 가상 매장으로 사실성·JSON/채널 형식·지연·비용 평가 설계, SDK 이전과 함께 검토. 강제 이전 기한 없음. 기존 승인 예산을 확대하거나 출력 상한을 자동 올리지 않는다. | 공식 본문 확인, 생성 호출·교체·배포 없음. 출시를 우리 지원 완료로 표시하지 않는다. |
| GBP-FEATURES | [GBP Change Log](https://developers.google.com/my-business/content/change-log): 식단 속성 2026-10-09, 리뷰 답글 URL 07-24, 반려 사유 07-01, 답글 심사 상태 04-01 | P2 보완 조사. 마지막 점검 이후 발표가 아니라 **기존 감사에서 빠진 근거를 이번에 발견**했다. 음식 메뉴 GLUTEN_FREE/DAIRY_FREE, reviewReplyUrl·PolicyViolation·ReviewReplyState. `shared/channels/oauth-identity.ts`, `readiness.ts`, `registry.ts`의 Google 연결/직접 게시 경로. 현재 backend Google 게시·리뷰 관리 어댑터는 없다. 실제 매장 권한·API 사용 승인 필요. | 향후 리뷰 운영 화면에 심사 상태·반려 이유·실제 답글 이동 경로 검토. 음식 속성은 검증된 매장 자료가 있을 때만 취급. 적용 의무·종료 기한 공지 없음. | 공식 본문 확인, API 왕복·실계정·기능 구현/배포 없음. |
| NAV-SUPPORT | [네이버 소상공인 협약](https://navercorp.com/media/pressReleasesDetail?seq=10034749), 발표 2026-10-13, 협약 10-12 | P2 정보. 협회 회원사·지역 소상공인 대상 Npay 커넥트 도입·데이터 활용·선정 업체 홍보/교육 계획. 결제 후 리뷰 연결을 소개하지만 신규 공개 API나 검색 순위 규칙 발표가 아니다. 우리 `naver-place.ts`·리뷰 수집에 직접 변경 근거 없음. | 지원 프로그램 자격·모집 공고 추적. 전체 고객 제공·자동 연동 가능으로 홍보하지 않는다. 시행/모집/적용 기한 미공개. | 공식 본문 확인, 제품/운영 변경 없음. |

## 기존 항목 상태 추적

| ID | 근거·영향 코드/고객 경로 | 2026-10-14 상태·중요도 | 기한·다음 대응·운영 상태 |
| --- | --- | --- | --- |
| GEM-SDK | [공식 라이브러리](https://ai.google.dev/gemini-api/docs/libraries), `web/package.json`, `shared/content-engine/{gemini-client,channel-native}.ts` | P1 유지. `@google/generative-ai ^0.24.1` 레거시 사용. [중단 일정](https://ai.google.dev/gemini-api/docs/deprecations)상 현재 2.5 Flash/Flash-Lite의 종료일 미발표, 과거 활성 사용자로 접근 제한. SDK 지원과 모델 종료는 별개. | SDK 이전 계획 필요, 계정별 가용성은 새 생성으로 확인하지 않음. 강제 종료일을 추정하지 않는다. 로컬/운영 이전 미완료. |
| META-SPEC | [Graph 버전](https://developers.facebook.com/docs/graph-api/changelog/versions), [Threads](https://developers.facebook.com/docs/threads/changelog/), [태그 도움말](https://help.instagram.com/351460621611097). `shared/channels/oauth-{config,identity}.ts`, `shared/content-engine/{channel-native,orchestrator,channel-formatter}.ts`, `backend/src/channels/instagram.ts` | P1 유지. Graph/Threads 재조회 429, Instagram 도움말 본문 확보 실패. v21.0 고정·20/30 태그 혼재·중복 결합·숫자 미디어 ID 주소 문제 잔존. | 최신 종료일/태그 제한 숫자 확정 실패. 확인 가능한 공식 근거 확보 후 버전/태그/정식 permalink/권한·토큰 회귀 검토. 운영 해결 증거 없음. |
| NAV-COLLECT | [SmartPlace 공지](https://new.smartplace.naver.com/notices), [D.I.A. 도움말](https://help.naver.com/service/5626/contents/22926?osType=COMMONOS). `backend/src/crawl-reviews.ts`, `shared/content-engine/place-crawler.ts`, 블로그 게시 보조 | P1 유지. 공지 목록 동적 본문 미노출. D.I.A. 일반 설명 재열람, 새 발표일/랭킹 가중치 확보 아님. DOM/업종별 URL/무리뷰와 실패 구분·설치 확장 주입 실검증 남음. | 공식 공지 접근 재확인, 실제 수집/편집기 검증은 별도 작업. 현재 점검에서는 수집·게시 실행 안 함. 운영 해결 미확인. |
| NAV-ORDERS | [변경 주문 API](https://apicenter.commerce.naver.com/docs/commerce-api/current/seller-get-last-changed-status-pay-order-seller), 문서 2.90.1 / 2026-10-07. `backend/src/channels/smartstore.ts` | P1 잔여 대사. 10-15 moreFrom/moreSequence 페이지 수정 운영 배포 완료(f67cc78에 1954f8e 포함). 변경일/주문일·취소/반품·토큰 갱신 실계정 대사 미완료. | 10-15 전체 265개 검사·가상 페이지 회귀 및 CI 성공. 배포는 완료했으나 실계정 매출 정확성 전체 검증은 남음. Mac 상주 워커의 checkout/재기동은 미확인, Windows 워커 미실행. |
| KAKAO-MSG | [알림톡 심사](https://kakaobusiness.gitbook.io/main/ad/infotalk/audit), [브랜드 메시지](https://docs.kakaoi.ai/kakao_i_connect_message/bizmessage/api/api_reference/bm/). `backend/src/channels/kakao-alimtalk.ts`, 채널 설명 | P1 유지. 정보성/승인 템플릿, 브랜드 메시지의 마케팅 수신 동의 또는 채널 친구 조건 재확인. 문서에 날짜 없는 내용을 새 정책 발표로 처리하지 않음. | 딜러 지원·발신프로필·승인 템플릿 실작동 미확인. 친구톡 종료일 확정 실패 유지. 설명 수정은 1954f8e 로컬, 브랜드 메시지 구현 없음. |
| DAANGN-NOTICE | [당근 공지](https://business.daangn.com/notice), 직접 게시용 단문 생성 경로 | P2 유지. 공지 목록 3행 껍데기만 반환되어 신규 기능/계정 조건 확인 실패. | 계정별 최신 도구·실제 게시 경로 별도 확인. 변경 없음 또는 최신 대응 완료로 판정하지 않음. |
| DEPLOY-1954 | Git 공개 master·Production deployment 7080904457/statuses | **2026-10-15 운영 배포 완료.** 사용자 요청으로 1954f8e 및 당근 수정 포함 f67cc780c158696002d6f4e19de0d566ae03fb96 반영, success 확인. | 코드/화면 CI 성공 및 기본 URL QA 검증. 별도 Mac 워커 실행 버전은 미확인. 배포 성공은 당근 실게시나 외부 플랫폼 전체 작동 증거가 아님. |

## 실행 이력

- **2026-10-15 KST**: 09:31 heartbeat. Gemini 최신 릴리스 10-13·2.5 종료일 미발표·레거시 SDK 상태, 커머스 2.90.1, GBP 최근 변경 10-09 재확인. Meta 3개 문서 본문 확보 실패, SmartPlace/당근 동적 공지 목록 미노출 유지. 카카오 알림톡 일반 URL 실패했으나 공식 `.md` 본문 확보, 정보성/브랜드 메시지 조건 유지. 네이버 10-14 Npay NFT 행사 티켓 공지는 검색/콘텐츠/주문 코드 변경 근거가 없어 별도 대응 제외. 아래 당근의 기존 누락 공지를 **공식 검색 색인**에서 보완했으며 실제 공지 URL은 3행 껍데기만 반환했다. 날짜가 지난 발표를 오늘 신규 발표로 표시하지 않는다. 코드·유료 호출·실게시·메시지·DB·워커 변경 없음. 로컬 HEAD 1954f8e, 원격 master 및 최신 Production 030d377 / deployment 6931355636 success 유지. 1954f8e 미배포, 기존 SDK/Meta/네이버 수집 위험 해결 증거 없음. 문서 변경만으로 반복 전체 테스트를 실행하지 않음.

- **2026-10-14 KST**: automation 첫 실제 heartbeat 수신(09:25, 설정 09:10). 공식 문서와 코드/원격 HEAD/Deployment 읽기 전용 대조. 신규 Argon 출시, Naver 협약 및 GBP 누락 근거 추가. Gemini3.7/3.5 Flash 자동 라우팅과 10-23 종료 Deep Research는 사용 코드에 해당 없어 긴급 이전 대상으로 잡지 않음. GBP Posts 가이드 업데이트 2026-08-28 재확인. Meta·SmartPlace·당근 확인 실패는 유지. 코드 변경·새 테스트·운영 health/고객 DB 조회·유료 생성·게시·발송·워커 실행 없음. 문서 갱신과 개인 프로젝트 비공개 연속성 백업만 수행. Mac 예약 이중화/미래 실행 보장은 미검증.

## DAANGN-NOTICE 보완 — 2026-10-15

기존 DAANGN-NOTICE의 ‘목록 확인 실패’를 유지하되 개별 공지의 공식 도메인 검색 색인을 확보했다. 직접 본문·실계정 재검증은 여전히 미완료이며 사이트 최신성 전체를 확인한 것은 아니다. 아래는 기존 감사 누락 사항이다. 당근 연결은 `registry.ts`상 manual/wip, `backend/src/channels/delivery-assisted.ts`는 링크/초안 보조이고 광고 OpenAPI·쿠폰 발송·당근 게시 수량 수집은 구현돼 있지 않다.

| 추적 항목 | 공식 근거·발표/시행 | 코드·고객 경로·중요도 | 적용 기한·대응·검증/운영 상태 |
| --- | --- | --- | --- |
| 광고 OpenAPI | [공지 414](https://business.daangn.com/notice/detail/414), 발표 2026-10-07 / 시행 10-15 | P2 연동 후보. 공식 승인 인터페이스의 호출 한도·인증·키 관리 조건 신설. 광고 API 정책을 일반 비즈프로필 소식 게시 API 제공으로 해석하지 않는다. | 오늘 시행. 우리 광고 API 호출 없음, 즉시 장애 증거 없음. 향후 도입 전 실제 개발 문서·승인 대상·권한 확인. 검색 색인 확인/직접 본문 실패/구현·운영 미반영. |
| 소식 작성량 | [공지 303](https://business.daangn.com/notice/detail/303), 발표 2026-04-01 / 시행 05-04 | P1 게시 보조 안내 검토. 소식 하루 최대 5개. `channel-native.ts`, `channel-formatter.ts`, `web/src/app/prepare/page.tsx`, `delivery-assisted.ts`에 관련 한도 안내·실제 외부 게시 수량 확인이 없다. 우리 초안 생성 횟수를 당근 실제 게시 횟수로 세지 않는다. | 이미 시행. 현행 계정 화면으로 한도 재확인 후 안내/중복 게시 방지 설계. 검색 색인만 확인, 자동 게시 없음, 코드·운영 반영 없음. |
| 업무용 계정 | [공지 405](https://business.daangn.com/notice/detail/405), 발표 09-22 / 배포 예정 10-07 | P2 사용자 이동 경로. 업무 계정 가입은 PC, 모바일은 로그인 지원. 기기 1계정으로 개인 계정이 로그아웃될 수 있음. `prepare/page.tsx`는 일반 당근 링크이며 업무 비즈프로필 도착 여부 미검증. | 예정일 경과가 실제 배포 증거는 아님. 모바일/PC 게시 경로·기존 로그인 전환 안내 실검증 필요. 계정 변경 실행 안 함. |
| 맞춤 쿠폰 | [공지 396](https://business.daangn.com/notice/detail/396), 발표 09-14 / 배포 예정 09-18 | P2 기능 후보. 채팅 문의·거래 이력에 따른 템플릿별 대상에게 쿠폰 전달. `registry.ts`의 ‘단골 쿠폰’은 기능 구현/자동 발송 증거 아님. | 별도 공식 API/대상 자격 확인 전 자동 연동 약속 금지. 검색 색인만 확인, 쿠폰 발송/권한 변경 없음. |
| 숙박 프로필 | [공지 398](https://business.daangn.com/notice/detail/398), 발표 09-14 / 등록 기한 11-09 / 제한 시행 11-10 | P1 **숙박업 이용 시 조건부**. 공지상 기존 숙박·호텔·리조트·펜션도 사업자 인증/영업신고증 확인 대상이며 미확인 프로필·게시글 노출 제한. 당근 게시 보조/고객 온보딩 경로에 업종별 준비 상태 안내 필요. | 11-09까지 등록 안내 검토. 해당 고객 존재는 DB 조회하지 않아 미확인. 플랫폼 공지 기록이며 법률 독자 해석/고객 서류 수집 없음. 검색 색인 확인/직접 본문 실패/운영 해결 미확인. |
| 광고 자동충전 | [공지 409](https://business.daangn.com/notice/detail/409), 발표 10-01 / 시행 예정 11-01 16:00(공지 표기, 시간대 미명시) | P2 **해당 광고주만**. 2025년 이전 비간편결제 카드 대상 재등록 안내, 미조치 시 충전 중단·잔액 소진 후 광고 중단. 우리 광고/충전 관리 기능 없음. | 대상 계정 확인 전 전 고객 조치 요구 금지. 결제수단 변경·자동충전 실행 안 함. 검색 색인만 확인. |
| 폐기 표기 공지 | [공지 412](https://business.daangn.com/notice/detail/412), 발표 10-08, 본문에 10-22 적용 표기, **제목에 ‘폐기’** | P2 확인 대기. 상품 판매 리드폼 심사 관련이나 제목과 본문 상태가 충돌한다. | 10-22를 확정 마감으로 경고하지 않음. 대체 공지/현재 운영정책 확인 전 적용 판단 보류. 우리 리드폼 광고 구현·호출 없음. |
