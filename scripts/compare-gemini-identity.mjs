import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const activationFile = new URL('../tmp/gemini-identity-activation.json', import.meta.url);
const target = 'https://marketing-allinone.vercel.app/api/internal/gemini-identity-check';
try {
  if (process.argv[2] === '--prepare') {
    const token = randomBytes(32).toString('base64url');
    const issuedAt = Date.now();
    const serverConfig = JSON.stringify({
      tokenSha256: createHash('sha256').update(token).digest('hex'),
      issuedAt, expiresAt: issuedAt + 15 * 60 * 1000,
    });
    await mkdir(new URL('../tmp/', import.meta.url), { recursive: true });
    await writeFile(activationFile, JSON.stringify({ token, serverConfig }), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ prepared: true, activationFile: fileURLToPath(activationFile), expiresAt: issuedAt + 15 * 60 * 1000 }));
  } else if (process.argv[2] === '--compare') {
    const key = process.env.GEMINI_IDENTITY_CANDIDATE_KEY;
    if (!key || key === '[SENSITIVE]') throw new Error('candidate_missing');
    const { token, serverConfig } = JSON.parse(await readFile(activationFile, 'utf8'));
    const config = JSON.parse(serverConfig);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || config.expiresAt <= Date.now()) throw new Error('activation_invalid');
    const nonce = randomBytes(32).toString('hex');
    const proof = createHmac('sha256', key).update('marketing-allinone:gemini-identity:v1\0' + nonce).digest('hex');
    const result = await fetch(target, {
      method: 'POST', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(10_000),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ nonce, proof }),
    });
    if (!result.ok) throw new Error(`probe_http_${result.status}`);
    const body = await result.json();
    if (typeof body.match !== 'boolean' || !(body.deploymentSha === null || /^[a-f0-9]{40}$/.test(body.deploymentSha))) throw new Error('invalid_response');
    console.log(JSON.stringify({ match: body.match, deploymentSha: body.deploymentSha }));
  } else {
    throw new Error('use_prepare_or_compare');
  }
} catch (error) {
  // Never echo transport errors, response bodies, environment values or input keys.
  const allowed = /^(candidate_missing|activation_invalid|use_prepare_or_compare|invalid_response|probe_http_\d{3})$/;
  console.error(JSON.stringify({ error: allowed.test(error?.message ?? '') ? error.message : 'probe_failed' }));
  process.exitCode = 1;
}
