'use client';
import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function SystemAlertBannerClient({ 
  initialIssues, 
  date 
}: { 
  initialIssues: string[]; 
  date: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !initialIssues || initialIssues.length === 0) return null;

  // Deduplicate and clean up error strings so they don't flood the UI
  const cleaned = initialIssues.map(issue => {
    if (issue.toLowerCase().includes('quota')) {
      const parts = issue.split('. For more information')[0];
      return parts.replace(/\\n/g, ' ').trim();
    }
    return issue;
  });
  const uniqueIssues = Array.from(new Set(cleaned));

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      await fetch('/api/alerts/clear', { method: 'POST' });
    } catch (e) {
      // Ignored
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-sm text-amber-900 relative">
      <button 
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-amber-700 hover:text-amber-950 p-1 rounded-md hover:bg-amber-200/50 transition-colors cursor-pointer"
        title="Dismiss Alert"
        aria-label="Dismiss Alert"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-amber-900">
            Overnight AI Tracker Notice ({date})
          </h4>
          <p className="text-xs text-amber-700 mt-0.5">
            The automated test completed, but encountered the following provider notice:
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-amber-900 bg-amber-100/70 p-2.5 rounded border border-amber-200">
            {uniqueIssues.map((issue, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="font-bold shrink-0">•</span>
                <span className="break-words leading-relaxed">{issue}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end">
            <button 
              onClick={handleDismiss} 
              className="text-xs font-medium text-amber-800 hover:text-amber-950 underline cursor-pointer"
            >
              Dismiss Alert
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
