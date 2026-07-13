# Supabase 복구 가이드 (참고용)

> ✅ **이미 해결됨 (2026-07-09)**: 새 무료 계정 프로젝트 **`exmbpietyadkjnunrhka`** 로 이전 완료 +
> Vercel 배포 라이브(https://marketing-allinone.vercel.app). `node scripts/verify-db.mjs` 9/9 통과.
> **지금은 이 문서대로 새로 만들 필요 없음** — 아래는 *향후 프로젝트가 또 죽을 때* 대비 참고 절차.
> (현 schema-all.sql은 0001~0004 합본이며, 소셜 로그인 설정은 `docs/oauth-setup.md` 참고.)
>
> ⚠️ 무료 한도는 **계정당 활성 프로젝트 2개**. 재발 시 billyssam 말고 **별도 무료 계정**에 만들 것.

---

<details><summary>옛 기록 (2026-07-08): 기존 프로젝트 NXDOMAIN 진단</summary>

기존 `oricgerprwgijnowjokn.supabase.co` = NXDOMAIN (무료한도 초과 중단). 이후 위와 같이 새 계정으로 이전해 해결됨.
</details>

## 빌리쌤이 하는 것 (브라우저, ~5분)

1. https://supabase.com/dashboard → **New project**
   - 기존 org가 한도 초과 상태면 **새 org(무료)** 를 먼저 만들고 그 안에 생성
   - Region: `Northeast Asia (Seoul)` 권장, DB 비밀번호는 아무거나(우린 REST만 씀)
2. 프로젝트 생성 완료되면 **SQL Editor** → New query →
   `backend/supabase/schema-all.sql` 내용 **통째로 붙여넣고 Run** (0001+0002+0003 합본)
3. **Project Settings → API** 에서 3개 복사:
   - `Project URL`
   - `anon` `public` 키
   - `service_role` 키
4. `web/.env.local` 의 해당 3줄 교체:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<Project URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
   SUPABASE_SERVICE_ROLE_KEY=<service_role>
   ```
   (GOOGLE_GENERATIVE_AI_API_KEY는 그대로 두면 됨)

## 그 다음 (자동 검증)

```bash
node scripts/verify-db.mjs
```

✅ 전부 통과하면 끝. 이어서:

```bash
npm run dev --prefix web
```

→ 회원가입 → 온보딩(매장 등록) → 대시보드 "✍️ 오늘 글 생성" 클릭 → 초안 저장 확인.

## 주의

- 인증 사용자·매장 데이터는 이전 프로젝트와 함께 사라졌으므로 **회원가입부터 다시** (온보딩 1회).
- 소셜 로그인(카카오/구글/네이버)은 새 프로젝트에서 Authentication → Providers 재설정 필요 (#4 OAuth 앱등록과 함께 진행).
- `.env.local`·키백업 파일은 git 금지 (기존 규칙 유지). `~/Desktop/ALLinONE/` 백업 txt의 Supabase 키도 이번에 갱신해둘 것.
