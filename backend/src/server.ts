import * as admin from 'firebase-admin';
import { randomUUID } from 'node:crypto';
import { cricketMaster, getCricApiKey, predictMatch } from './cricket';
import { createApiServer } from './http';
import { startScheduler } from './scheduler';
import { logger } from './logger';

// Fail startup before accepting traffic if required credentials are missing.
getCricApiKey();
if (!process.env.GROQ_API_KEY?.trim()) throw new Error('GROQ_API_KEY is not configured');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');

async function scheduledTick(): Promise<void> {
  const ref = admin.firestore().collection('backend_runtime').doc('cricket_master');
  const owner = randomUUID();
  const acquired = await admin.firestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if ((snapshot.data()?.leaseUntil || 0) > Date.now()) return false;
    transaction.set(ref, { owner, leaseUntil: Date.now() + 10 * 60000 });
    return true;
  });
  if (!acquired) return;
  try {
    await cricketMaster();
  } finally {
    await admin.firestore().runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (snapshot.data()?.owner === owner) transaction.delete(ref);
    });
  }
}

const server = createApiServer({ getKey: getCricApiKey, predict: predictMatch });
server.requestTimeout = 30000;
server.headersTimeout = 15000;
const stopScheduler = process.env.SCHEDULER_ENABLED === 'false'
  ? async () => {} : startScheduler(scheduledTick, error => logger.error('[Scheduler]', error));
server.listen(port, '0.0.0.0', () => logger.info(`Backend listening on port ${port}`));
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const closed = new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
  const deadline = setTimeout(() => process.exit(1), 30000);
  deadline.unref();
  await Promise.all([closed, stopScheduler()]);
  await admin.app().delete();
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
