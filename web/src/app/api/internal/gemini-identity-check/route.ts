import { checkGeminiIdentity } from '@/lib/server/gemini-identity-probe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return checkGeminiIdentity(request, process.env);
}

export function GET() {
  return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });
}
