import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function POST() {
  if (adminDb && adminDb.collection) {
    try {
      await adminDb.collection('system_alerts').doc('latest_cron_alert').set({
        resolved: true,
        timestamp: new Date()
      }, { merge: true });
    } catch (e) {
      console.error("Failed to dismiss alert in Firestore:", e);
    }
  }
  return NextResponse.json({ success: true });
}
