import StatCard from '@/components/dashboard/StatCard';
import VisibilityChart from '@/components/dashboard/VisibilityChart';
import ExportControls from '@/components/dashboard/ExportControls';
import DateFilter from '@/components/dashboard/DateFilter';
import { aggregateData } from '@/lib/data-aggregation';
import { fetchGSCTrend } from '@/lib/gsc-api';
import { adminDb } from '@/lib/firebase-admin';
import {
  buildDateRangeArray,
  getDateRangeBounds,
  getPreviousPeriod,
  mergeComparisonData,
} from '@/lib/date-utils';
import { resolveFilterParams } from '@/lib/filter-prefs';
import { DEFAULT_CLIENT_ID, getActiveClientConfig } from '@/lib/clients';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default async function DashboardOverview({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    granularity?: string;
    start?: string;
    end?: string;
    compare?: string;
  }>;
}) {
  const [resolvedParams, activeClient] = await Promise.all([
    searchParams,
    getActiveClientConfig(),
  ]);
  const { range, granularity, start, end, compare } = await resolveFilterParams(resolvedParams);

  const siteUrl = activeClient.gscSiteUrl || (activeClient.domain ? `sc-domain:${activeClient.domain}` : '');

  const today = new Date();
  const { startDate: fsStart, endDate: fsEnd } = getDateRangeBounds(range, today, start, end);
  const { prevStart, prevEnd } = getPreviousPeriod(range, today, start, end);

  const [gscResult, prevGscResult] = await Promise.all([
    siteUrl
      ? fetchGSCTrend(siteUrl, fsStart, fsEnd)
      : Promise.resolve({ timeSeriesData: [], totals: { avgPosition: '0.0', clicks: 0, impressions: 0 } }),
    compare && prevStart && prevEnd && siteUrl
      ? fetchGSCTrend(siteUrl, prevStart, prevEnd)
      : Promise.resolve({ timeSeriesData: [] }),
  ]);
  let gscData = gscResult.timeSeriesData || [];
  let prevGscData = prevGscResult.timeSeriesData || [];

  // Fetch LLM Visibility scores from Firebase for activeClient
  let llmDataMap: Record<string, any> = {};
  let prevLlmDataMap: Record<string, any> = {};

  try {
    if (adminDb && typeof adminDb.collection === 'function') {
      const llmSnapshot = await adminDb
        .collection('llm_visibility')
        .where('date', '>=', fsStart)
        .where('date', '<=', fsEnd)
        .get();

      llmSnapshot.forEach((doc: any) => {
        const data = doc.data();
        const docClientId = data.clientId || DEFAULT_CLIENT_ID;
        if (docClientId !== activeClient.id) return;

        llmDataMap[data.date] = {
          ChatGPT: data.chatgpt_score || 0,
          Claude: data.claude_score || 0,
          Gemini: data.gemini_score || 0,
        };
      });

      if (compare && prevStart && prevEnd) {
        const prevSnapshot = await adminDb
          .collection('llm_visibility')
          .where('date', '>=', prevStart)
          .where('date', '<=', prevEnd)
          .get();

        prevSnapshot.forEach((doc: any) => {
          const data = doc.data();
          const docClientId = data.clientId || DEFAULT_CLIENT_ID;
          if (docClientId !== activeClient.id) return;

          prevLlmDataMap[data.date] = {
            ChatGPT: data.chatgpt_score || 0,
            Claude: data.claude_score || 0,
            Gemini: data.gemini_score || 0,
          };
        });
      }
    }
  } catch (e) {
    console.error('Error fetching LLM data from Firebase', e);
  }

  if (gscData.length === 0) {
    gscData = buildDateRangeArray(fsStart, fsEnd).map(dateStr => ({
      date: dateStr,
      Google: 0,
      Clicks: 0,
      Impressions: 0,
    }));
  }

  let lastKnown = { ChatGPT: 0, Claude: 0, Gemini: 0 };
  const sortedDatesWithData = Object.keys(llmDataMap).sort();
  if (sortedDatesWithData.length > 0) {
    lastKnown = { ...llmDataMap[sortedDatesWithData[0]] };
  }
  const earliestDataDate = sortedDatesWithData[0] || '9999-99-99';

  let mergedData = gscData.map(row => {
    if (llmDataMap[row.date]) {
      lastKnown = { ...llmDataMap[row.date] };
    }
    const useCarry = row.date >= earliestDataDate;
    return {
      ...row,
      ChatGPT: llmDataMap[row.date]?.ChatGPT ?? (useCarry ? lastKnown.ChatGPT : 0),
      Claude: llmDataMap[row.date]?.Claude ?? (useCarry ? lastKnown.Claude : 0),
      Gemini: llmDataMap[row.date]?.Gemini ?? (useCarry ? lastKnown.Gemini : 0),
    };
  });

  if (mergedData.length > 0) {
    mergedData = aggregateData(mergedData, granularity, 'average');
  }

  if (compare) {
    let mergedPrevData = prevGscData.map(row => ({
      ...row,
      ChatGPT: prevLlmDataMap[row.date]?.ChatGPT || 0,
      Claude: prevLlmDataMap[row.date]?.Claude || 0,
      Gemini: prevLlmDataMap[row.date]?.Gemini || 0,
    }));

    if (mergedPrevData.length > 0) {
      mergedPrevData = aggregateData(mergedPrevData, granularity, 'average');
    }

    mergedData = mergeComparisonData(mergedData, mergedPrevData, [
      'Google',
      'ChatGPT',
      'Claude',
      'Gemini',
    ]);
  }

  const avgGoogleRank = gscResult.totals?.avgPosition || '0.0';

  let totalChatGPT = 0,
    totalClaude = 0;
  let count = 0;
  Object.values(llmDataMap).forEach((day: any) => {
    totalChatGPT += day.ChatGPT || 0;
    totalClaude += day.Claude || 0;
    count++;
  });

  const avgChatGPT = count > 0 ? Math.round(totalChatGPT / count) : 0;
  const avgClaude = count > 0 ? Math.round(totalClaude / count) : 0;
  const exportPrefix = activeClient.name.replace(/[^a-zA-Z0-9]+/g, '_');

  return (
    <div id="dashboard-content" className="space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
            Overview — {activeClient.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Combined SEO and LLM Visibility Metrics ({activeClient.domain || activeClient.primaryLocation})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Suspense fallback={<div className="h-8 w-32 bg-slate-100 rounded animate-pulse"></div>}>
            <DateFilter />
          </Suspense>
          <ExportControls data={mergedData} filename={`${exportPrefix}_Overview`} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
        <StatCard title="Google Search Avg Position" value={avgGoogleRank} change={0} />
        <StatCard title="ChatGPT Visibility" value={avgChatGPT.toString() + '%'} change={0} />
        <StatCard title="Claude Visibility" value={avgClaude.toString() + '%'} change={0} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="mb-3 sm:mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-800">Visibility Trend</h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Google rankings are LIVE ({siteUrl || 'GSC not set'}). LLM visibility updates via scheduled or manual runs.
            </p>
          </div>
        </div>
        <VisibilityChart
          data={mergedData}
          reversedY={true}
          domainY={[1, 'auto']}
          compare={compare}
          lines={[
            { key: 'Google', color: '#6B4BC8', name: 'Google Position' },
            { key: 'ChatGPT', color: '#10b981', name: 'ChatGPT' },
            { key: 'Claude', color: '#f59e0b', name: 'Claude' },
            { key: 'Gemini', color: '#3b82f6', name: 'Gemini' },
          ]}
        />
      </div>
    </div>
  );
}
