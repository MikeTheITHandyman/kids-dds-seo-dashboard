import StatCard from '@/components/dashboard/StatCard';
import VisibilityChart from '@/components/dashboard/VisibilityChart';
import ExportControls from '@/components/dashboard/ExportControls';
import DateFilter from '@/components/dashboard/DateFilter';
import { aggregateData } from '@/lib/data-aggregation';
import { adminDb } from '@/lib/firebase-admin';
import {
  buildDateRangeArray,
  getDateRangeBounds,
  getPreviousPeriod,
  mergeComparisonData,
} from '@/lib/date-utils';
import { resolveFilterParams } from '@/lib/filter-prefs';
import LLMDetailViewer from '@/components/dashboard/LLMDetailViewer';
import { Suspense } from 'react';

export default async function LLMVisibility({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; granularity?: string; start?: string; end?: string; compare?: string }>;
}) {
  const resolvedParams = await searchParams;
  const { range, granularity, start, end, compare } = await resolveFilterParams(resolvedParams);

  const today = new Date();
  const { startDate: fsStart, endDate: fsEnd } = getDateRangeBounds(range, today, start, end);
  const { prevStart, prevEnd } = getPreviousPeriod(range, today, start, end);

  // Fetch real LLM Visibility scores from Firebase
  let llmDataMap: Record<string, any> = {};
  let prevLlmDataMap: Record<string, any> = {};
  let totalChatGPT = 0,
    totalClaude = 0,
    totalGemini = 0;
  let count = 0;

  try {
    if (adminDb && typeof adminDb.collection === 'function') {
      const llmSnapshot = await adminDb
        .collection('llm_visibility')
        .where('date', '>=', fsStart)
        .where('date', '<=', fsEnd)
        .get();

      llmSnapshot.forEach((doc: any) => {
        const data = doc.data();
        llmDataMap[data.date] = {
          ChatGPT: data.chatgpt_score || 0,
          Claude: data.claude_score || 0,
          Gemini: data.gemini_score || 0,
        };
        totalChatGPT += data.chatgpt_score || 0;
        totalClaude += data.claude_score || 0;
        totalGemini += data.gemini_score || 0;
        count++;
      });

      if (compare && prevStart && prevEnd) {
        const prevSnapshot = await adminDb
          .collection('llm_visibility')
          .where('date', '>=', prevStart)
          .where('date', '<=', prevEnd)
          .get();

        prevSnapshot.forEach((doc: any) => {
          const data = doc.data();
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

  let lastKnown = { ChatGPT: 0, Claude: 0, Gemini: 0 };
  const sortedDatesWithData = Object.keys(llmDataMap).sort();
  if (sortedDatesWithData.length > 0) {
    lastKnown = { ...llmDataMap[sortedDatesWithData[0]] };
  }
  const earliestDataDate = sortedDatesWithData[0] || '9999-99-99';

  const currentDates = buildDateRangeArray(fsStart, fsEnd);
  let chartData = currentDates.map((dateStr) => {
    if (llmDataMap[dateStr]) {
      lastKnown = { ...llmDataMap[dateStr] };
    }

    const useCarry = dateStr >= earliestDataDate;
    return {
      date: dateStr,
      ChatGPT: llmDataMap[dateStr]?.ChatGPT ?? (useCarry ? lastKnown.ChatGPT : 0),
      Claude: llmDataMap[dateStr]?.Claude ?? (useCarry ? lastKnown.Claude : 0),
      Gemini: llmDataMap[dateStr]?.Gemini ?? (useCarry ? lastKnown.Gemini : 0),
    };
  });

  chartData = aggregateData(chartData, granularity, 'average');

  if (compare && prevStart && prevEnd) {
    const prevDates = buildDateRangeArray(prevStart, prevEnd);
    let prevChartData = prevDates.map((pDateStr) => ({
      date: pDateStr,
      ChatGPT: prevLlmDataMap[pDateStr]?.ChatGPT || 0,
      Claude: prevLlmDataMap[pDateStr]?.Claude || 0,
      Gemini: prevLlmDataMap[pDateStr]?.Gemini || 0,
    }));
    prevChartData = aggregateData(prevChartData, granularity, 'average');
    chartData = mergeComparisonData(chartData, prevChartData, ['ChatGPT', 'Claude', 'Gemini']);
  }

  const avgGPT = count > 0 ? (totalChatGPT / count).toFixed(1) + '%' : '0%';
  const avgClaude = count > 0 ? (totalClaude / count).toFixed(1) + '%' : '0%';
  const avgGemini = count > 0 ? (totalGemini / count).toFixed(1) + '%' : '0%';

  // Fetch detailed cron run logs from Firestore
  let cronRunLogs: any[] = [];
  if (adminDb && adminDb.collection) {
    try {
      const logsSnap = await adminDb
        .collection('cron_logs')
        .orderBy('startTime', 'desc')
        .limit(20)
        .get();

      cronRunLogs = logsSnap.docs.map((doc: any) => {
        const d = doc.data();
        return {
          id: doc.id,
          date: d.date || 'Recent',
          communities_tested: d.communities_tested || [],
          chatgpt_score: d.chatgpt_score || 0,
          claude_score: d.claude_score || 0,
          gemini_score: d.gemini_score || 0,
          logs: d.logs || [],
        };
      });
    } catch (e) {
      console.error('Error fetching cron_logs:', e);
    }
  }

  return (
    <div id="dashboard-content" className="space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">LLM Recommendation Engine</h1>
          <p className="text-xs sm:text-sm text-slate-500">Live cron job tracking of ChatGPT, Claude, and Gemini</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Suspense fallback={<div className="h-8 w-32 bg-slate-100 rounded animate-pulse"></div>}>
            <DateFilter />
          </Suspense>
          <ExportControls data={chartData} filename="Kids_DDS_LLM_Visibility" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
        <StatCard title="ChatGPT Recommendation Score" value={avgGPT} change={0} />
        <StatCard title="Claude Recommendation Score" value={avgClaude} change={0} />
        <StatCard title="Gemini Recommendation Score" value={avgGemini} change={0} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="mb-3 sm:mb-4 flex flex-col justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-800">LLM Visibility Trend</h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Percentage of times the AI recommends Kids DDS when asked a targeted question about local pediatric
              dentistry.
            </p>
          </div>
        </div>
        <VisibilityChart
          data={chartData}
          reversedY={false}
          domainY={[0, 100]}
          compare={compare}
          lines={[
            { key: 'ChatGPT', color: '#10b981', name: 'ChatGPT' },
            { key: 'Claude', color: '#f59e0b', name: 'Claude' },
            { key: 'Gemini', color: '#3b82f6', name: 'Gemini' },
          ]}
        />
      </div>

      {/* Interactive LLM Questions & Answers Audit Trail */}
      <LLMDetailViewer runs={cronRunLogs} />
    </div>
  );
}
