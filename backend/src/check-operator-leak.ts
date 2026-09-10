/**
 * 고객 화면에 **운영자 용어가 새는지** 전수 점검.
 *
 * 왜 필요한가: 이 제품에는 흐름이 둘이고, 섞이면 3주를 잃는다(2026-09-09 실측).
 *
 *   운영자(우리)가 한 번 : Meta 앱 등록·심사, Google Cloud, 알리고 계정 → **환경변수**
 *   고객이 매장마다      : 버튼 눌러 자기 계정 로그인, 자기만 발급 가능한 키 입력
 *
 * 실제로 저질렀던 일:
 *   · 고객 화면에 "Meta 심사 4~6주 — App ID 대기"를 띄웠다
 *   · 알림톡 연결에서 **우리 알리고 계정**을 고객에게 물어봤다
 *   · "사장님이 App ID를 주시면"이라고 3주간 적으며 열 수 있는 채널을 안 열었다
 *
 * 화면 검증(`test-channels-screen`)은 `/channels` 한 곳만 본다. 화면은 16개다.
 * 그래서 **소스에서 전수로** 센다 — 새 화면을 만들어도 자동으로 걸린다.
 *
 * 사용법: npx tsx src/check-operator-leak.ts
 * 종료코드: 새는 곳이 있으면 1
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const WEB = resolve(process.cwd(), '../web/src');

/** 고객이 절대 볼 일 없는 말들 — 알아도 할 수 있는 게 없는 것들 */
const OPERATOR_TERMS = [
  'App ID', 'app id', 'APP_ID',
  'client_id', 'client_secret', 'clientSecret',
  'META_APP', 'GOOGLE_CLIENT',
  '알리고', 'aligo', 'Aligo',
  '환경변수', 'env var',
  '심사 4~6주', '심사 중', '심사 대기',
];

/**
 * 검사에서 빼는 것:
 *  - 주석·JSDoc: 개발자가 읽는 글이다(오히려 여기 적혀 있어야 한다)
 *  - `process.env.X` 참조: 코드가 환경변수를 읽는 건 당연하다
 *  - 문자열 안의 환경변수 **이름**(operatorReadyEnv 같은 설정값)
 */
function customerVisibleText(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')     // 블록 주석
    .replace(/(^|[^:])\/\/.*$/gm, '$1')   // 줄 주석(URL 의 // 는 남긴다)
    .replace(/process\.env\.[A-Z_]+/g, '') // 환경변수 참조
    .replace(/operatorReadyEnv:\s*'[^']*'/g, '') // 설정의 환경변수 이름
    .replace(/clientIdEnv:\s*'[^']*'/g, '')
    .replace(/clientSecretEnv:\s*'[^']*'/g, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      // API 라우트는 고객이 글자를 읽지 않는다(리다이렉트만 한다)
      if (name === 'api') continue;
      walk(p, out);
    } else if (/\.tsx$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function main() {
  const files = walk(WEB);
  const hits: { file: string; term: string; line: number; text: string }[] = [];

  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const cleaned = customerVisibleText(src);
    const lines = cleaned.split('\n');
    lines.forEach((line, i) => {
      for (const t of OPERATOR_TERMS) {
        if (line.includes(t)) {
          hits.push({ file: relative(WEB, f), term: t, line: i + 1, text: line.trim().slice(0, 100) });
        }
      }
    });
  }

  console.log(`고객 화면 ${files.length}개 점검\n`);
  if (!hits.length) {
    console.log('✅ 운영자 용어 노출 0건');
    console.log('   (Meta 앱·알리고 계정은 우리가 한 번 하는 일 — 고객은 버튼만 누른다)');
    return;
  }
  console.log(`🔴 운영자 용어가 고객 화면에 ${hits.length}건 새고 있다:\n`);
  for (const h of hits) {
    console.log(`  ${h.file}:${h.line}  "${h.term}"`);
    console.log(`     ${h.text}`);
  }
  console.log('\n고객은 이 말들을 알 필요도, 알아도 할 수 있는 것도 없다.');
  console.log('운영자가 할 일은 docs/OPERATOR_SETUP.md 에 적는다.');
  process.exit(1);
}

main();
