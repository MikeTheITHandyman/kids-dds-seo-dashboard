import { adminDb } from '@/lib/firebase-admin';
import { AlertTriangle } from 'lucide-react';

export default async function SystemAlertBanner() {
  if (!adminDb || !adminDb.collection) return null;

  try {
    const doc = await adminDb.collection('system_alerts').doc('latest_cron_alert').get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (data?.resolved || !data?.issues || data.issues.length === 0) return null;

    return (
      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-amber-900">
              Action Required: Overnight AI Tracker Alert
            </h4>
            <p className="text-xs text-amber-700 mt-0.5">
              The automated tracker ran for {data.date}, but encountered the following critical provider issues:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-800 bg-amber-100/70 p-2.5 rounded border border-amber-200">
              {data.issues.map((issue: string, idx: number) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="font-bold">•</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  } catch (e) {
    return null;
  }
}
