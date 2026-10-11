import { adminDb } from '@/lib/firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const LOCK_DOC = 'system_locks/ai_harness_lock';
const LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15-minute lock auto-expiry
const LOCAL_LOCK_FILE = path.join(process.cwd(), '.ai_harness.lock');

export interface LockResult {
  acquired: boolean;
  lockId?: string;
  reason?: string;
}

export async function acquireRunLock(): Promise<LockResult> {
  const now = Date.now();
  const lockId = `run_${now}_${Math.random().toString(36).substring(2, 7)}`;

  // 1. Check local file lock (for CLI scripts)
  try {
    if (fs.existsSync(LOCAL_LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCAL_LOCK_FILE, 'utf8'));
      if (now - lockData.timestamp < LOCK_TIMEOUT_MS) {
        return { acquired: false, reason: `Local lock active from run ${lockData.lockId}` };
      }
    }
    fs.writeFileSync(LOCAL_LOCK_FILE, JSON.stringify({ lockId, timestamp: now }));
  } catch (e) {
    // Ignore file write errors on read-only serverless disk
  }

  // 2. Check Firestore distributed lock (for cloud serverless runs)
  if (adminDb && adminDb.doc) {
    try {
      const lockRef = adminDb.doc(LOCK_DOC);
      const snap = await lockRef.get();

      if (snap.exists) {
        const data = snap.data();
        if (data?.locked && (now - (data.timestamp || 0) < LOCK_TIMEOUT_MS)) {
          return { acquired: false, reason: `Firestore lock active: ${data.lockId}` };
        }
      }

      await lockRef.set({
        locked: true,
        lockId,
        timestamp: now,
        startedAt: new Date().toISOString()
      });
    } catch (e: any) {
      console.warn("Firestore lock check warning:", e.message);
    }
  }

  return { acquired: true, lockId };
}

export async function releaseRunLock(lockId?: string): Promise<void> {
  // Release local lock file
  try {
    if (fs.existsSync(LOCAL_LOCK_FILE)) {
      fs.unlinkSync(LOCAL_LOCK_FILE);
    }
  } catch {}

  // Release Firestore lock
  if (adminDb && adminDb.doc) {
    try {
      await adminDb.doc(LOCK_DOC).set({
        locked: false,
        releasedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e: any) {
      console.warn("Error releasing Firestore lock:", e.message);
    }
  }
}
