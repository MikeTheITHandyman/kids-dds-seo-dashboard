import { adminDb } from '@/lib/firebase-admin';
import SystemAlertBannerClient from './SystemAlertBannerClient';

export default async function SystemAlertBanner() {
  if (!adminDb || !adminDb.collection) return null;

  try {
    const doc = await adminDb.collection('system_alerts').doc('latest_cron_alert').get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (data?.resolved || !data?.issues || data.issues.length === 0) return null;

    return (
      <SystemAlertBannerClient 
        initialIssues={data.issues} 
        date={data.date || 'Recent Run'} 
      />
    );
  } catch (e) {
    return null;
  }
}
