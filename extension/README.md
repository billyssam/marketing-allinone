# 블로그 원클릭 (Pre-Service) 익스텐션

네이버 블로그 write 페이지에 초안을 자동으로 채워주는 크롬 확장(MV3).

## 개발용 설치 (Chrome)

1. Chrome 주소창에 `chrome://extensions` 입력
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다** 클릭
4. 이 폴더(`Pre-Service-Blog-Instagram/extension/`) 선택
5. 확장 목록에 "블로그 원클릭 (Pre-Service)" 표시되면 성공

## 사용 흐름 (파일럿)

### 사장님 관점
1. SaaS 대시보드에서 오늘 초안 검토 → **"블로그로 보내기"** 클릭
2. 대시보드가 네이버 블로그 write 페이지를 새 탭으로 염
3. 페이지 우측 하단에 **FAB** 뜸 (📝 준비된 초안)
4. **"에디터에 삽입"** 클릭 → 제목·본문·태그 자동 채워짐
5. 사장님이 사진 몇 장 드래그드롭 후 **"발행"** 클릭

### 개발자 관점 (테스트)
1. `npm run test:draft` 로 `web/output/last-draft.json` 생성
2. 익스텐션 아이콘 클릭 → 팝업 열기
3. 팝업 텍스트박스에 JSON 붙여넣기 → **저장**
4. **"네이버 블로그 write 열기"** 클릭
5. 로그인 후 FAB 나타나면 삽입 테스트

## 구조

```
extension/
├─ manifest.json          # MV3 매니페스트
├─ background.js           # Service Worker (메시지 라우팅·저장)
├─ content.js              # 콘텐츠 스크립트 (FAB·주입 로직)
├─ content.css             # FAB 스타일
├─ popup/
│  ├─ popup.html
│  ├─ popup.js
│  └─ popup.css
└─ README.md
```

## 상태 (2026-07-01, v0.2.0)

- ✅ MV3 매니페스트 + 호스트 권한 (naver.com blog)
- ✅ 팝업 UX (초안 프리뷰·붙여넣기·상태 배너)
- ✅ 메시지 라우팅 (외부·내부·콘텐츠 스크립트)
- ✅ chrome.storage.local 초안 저장
- ✅ FAB 자동 표시 (write 페이지 감지)
- ⚠️ SmartEditor ONE 실제 셀렉터 — **DOM 실측 후 최종화 예정**
- ⚠️ 이미지 첨부 자동화 — 미구현
- ⚠️ Chrome Web Store 배포 — 이후

## Phase 2 남은 작업

- [ ] SmartEditor ONE DOM 실측 (사용자 개인 계정)
- [ ] 제목·본문·태그 실제 셀렉터 반영
- [ ] 이미지 드래그드롭 시뮬레이션
- [ ] 아이콘 (16·48·128 PNG)
- [ ] Chrome Web Store 리스팅 자료
