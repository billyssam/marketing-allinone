import 'server-only';

/**
 * **운영자 준비 상태** — 우리 앱 등록이 끝난 연동은 무엇인가.
 *
 * 이 제품에는 흐름이 둘이다.
 *   운영자(우리)가 한 번 : Meta 앱 등록·심사, Google Cloud 프로젝트 → **환경변수**
 *   고객이 매장마다      : 버튼 눌러 자기 계정 로그인
 *
 * 🔴 이 판단은 **서버에서만** 한다. 화면 파일(.tsx)에 환경변수 이름을 두지 않는다 —
 *    두면 고객 화면 누출 점검(`check-operator-leak.ts`)에 걸리고, 실제로 걸렸다.
 *    점검을 느슨하게 푸는 대신 코드를 옮긴다.
 *
 * 준비가 안 된 연동은 화면에서 `아직 못 엽니다` 로 떨어진다 —
 * 눌러도 안 되는 버튼을 보여주면 고객은 자기가 뭘 잘못한 줄 안다.
 */
export function operatorReadyIntegrations(): string[] {
  const ready: string[] = [];
  if (process.env.META_APP_ID && process.env.META_APP_SECRET) ready.push('META_APP_ID');
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ready.push('GOOGLE_CLIENT_ID');
  return ready;
}
