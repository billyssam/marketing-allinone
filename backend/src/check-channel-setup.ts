/** Read-only setup inventory. Prints presence flags, never credential values. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { OAUTH_CONFIG, redirectUriFor } from '../../shared/channels/oauth-config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const origin = 'https://marketing-allinone.vercel.app';
const groups: Record<string, string[]> = {
  instagram: ['META_APP_ID', 'META_APP_SECRET'],
  facebook: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  threads: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  google_business: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  naver_account_login: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'],
  kakao_alimtalk_operator: ['ALIGO_API_KEY', 'ALIGO_USER_ID', 'ALIGO_PROFILE_KEY', 'ALIGO_SENDER'],
};

async function main() {
  const local: Record<string, string> = {};
  for (const name of ['backend/.env', 'web/.env.local']) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) Object.assign(local, parse(fs.readFileSync(file)));
  }
  let productionNames: Set<string> | undefined;
  if (process.argv.includes('--vercel')) {
    const project = JSON.parse(fs.readFileSync(path.join(root, '.vercel/project.json'), 'utf8'));
    if (project.projectName !== 'marketing-allinone') throw new Error('Unexpected Vercel project');
    const authFile = path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData/Roaming'), 'com.vercel.cli/Data/auth.json');
    const auth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    const response = await fetch(`https://api.vercel.com/v9/projects/${project.projectId}/env?teamId=${project.orgId}`, {
      headers: { Authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Vercel metadata HTTP ${response.status}`);
    const data = await response.json() as { envs: { key: string; target?: string[] }[] };
    productionNames = new Set(data.envs.filter((env) => env.target?.includes('production')).map((env) => env.key));
  }
  const credentials = Object.entries(groups).map(([purpose, names]) => ({
    purpose,
    localPresence: Object.fromEntries(names.map((name) => [name, Boolean(local[name]?.trim())])),
    productionPresence: productionNames ? Object.fromEntries(names.map((name) => [name, productionNames.has(name)])) : null,
    productionNamesComplete: productionNames ? names.every((name) => productionNames.has(name)) : null,
    ownershipAndProviderApprovalVerified: false,
  }));
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(), readOnly: true, credentialValuesPrinted: false,
    productionMetadataChecked: Boolean(productionNames), origin, credentials,
    implementedChannelOAuth: Object.entries(OAUTH_CONFIG).map(([channel, cfg]) => ({
      channel, callback: redirectUriFor(origin, channel), authUrl: cfg!.authUrl,
      requestedScopes: cfg!.scopes, externalAuthenticationVerified: false,
    })),
    loginCallbacks: {
      googleAndKakao: 'https://exmbpietyadkjnunrhka.supabase.co/auth/v1/callback',
      naver: `${origin}/auth/naver/callback`,
    },
    missingChannelOAuthImplementation: [],
    facebookSelectionPath: `${origin}/api/connect/facebook/select`,
    newSocialConnections: { permissionMode: 'read', productionCredentialsInstalled: false, liveProviderValidationComplete: false },
    warnings: [
      'Presence does not prove ownership, valid credentials, app review, API quota, or a working connection.',
      'Do not upload a local secret without confirming its app, owner, and matching client ID.',
      'Do not reuse account-login OAuth credentials or Gemini API keys as channel access tokens.',
      'Facebook and Threads read-only OAuth is implemented locally; live app credentials, review and provider validation remain required.',
      'No provider request, token exchange, database write, deployment, or message was performed.',
    ],
  }, null, 2));
}

main().catch(() => { console.error('Channel setup inventory failed; credential-bearing error details suppressed.'); process.exitCode = 1; });
