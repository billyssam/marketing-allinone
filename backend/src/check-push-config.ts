import { createHash } from 'node:crypto';
import { validVapidKeyPair } from '../../shared/push-subscription';

// Read-only: no database, browser push service, or content-generation requests.
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const paired = validVapidKeyPair(publicKey, process.env.VAPID_PRIVATE_KEY);
console.log(JSON.stringify({ check: 'push-configuration', paired,
  publicKeyDigest: paired ? createHash('sha256').update(publicKey!).digest('hex') : null,
  notificationsSent: 0, paidGenerationCalls: 0 }));
if (!paired) process.exitCode = 1;
