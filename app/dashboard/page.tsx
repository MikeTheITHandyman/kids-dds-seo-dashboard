import StatCard from '@/components/dashboard/StatCard';
import VisibilityChart from '@/components/dashboard/VisibilityChart';
import ExportControls from '@/components/dashboard/ExportControls';
import DateFilter from '@/components/dashboard/DateFilter';
import { aggregateData, Granularity } from '@/lib/data-aggregation';
import { fetchGSCTrend } from '@/lib/gsc-api';
import { adminDb } from '@/lib/firebase-admin';
import { getPreviousPeriod, mergeComparisonData } from '@/lib/date-utils';
import { Suspense } from 'react';

const SITE_URL = 'sc-domain:kidsdds.com'; 

export default async function DashboardOverview({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; granularity?: string; start?: string; end?: string; compare?: string }>;
}) {
  const resolvedParams = await searchParams;
  const range = resolvedParams.range || '30D';
  const granularity = (resolvedParams.granularity || 'day') as Granularity;
  const compare = resolvedParams.compare === 'true';
  
  // Calculate start and end dates for the API
  let startDate = '30daysAgo';
  let endDate = 'today';
  
  const today = new Date();
  if (range === 'YTD') {
    startDate = `${today.getFullYear()}-01-01`;
  } else if (range === 'TW') {
    const d = new Date(today);
    const day = d.getDay(); // 0 is Sunday
    d.setDate(d.getDate() - day);
    startDate = d.toISOString().split('T')[0];
    endDate = today.toISOString().split('T')[0];
  } else if (range === 'LW') {
    const d = new Date(today);
    const day = d.getDay();
    d.setDate(d.getDate() - day - 7);
    startDate = d.toISOString().split('T')[0];
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    endDate = end.toISOString().split('T')[0];
  } else if (range === 'TM') {
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    startDate = `${today.getFullYear()}-${month}-01`;
  } else if (range === 'LM') {
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const m = (startOfLastMonth.getMonth() + 1).toString().padStart(2, '0');
    const y = startOfLastMonth.getFullYear();
    startDate = `${y}-${m}-01`;
    endDate = `${y}-${m}-${endOfLastMonth.getDate()}`;
  } else if (range === '1D') {
    startDate = 'today';
    endDate = 'today';
  } else if (range === 'custom') {
    startDate = resolvedParams.start || '30daysAgo';
    endDate = resolvedParams.end || 'today';
  }

  // Convert startDate and endDate to standard YYYY-MM-DD for APIs that require strict formatting (GSC, Firestore)
  let fsStart = startDate;
  let fsEnd = endDate;
  
  if (fsStart === '30daysAgo') {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    fsStart = d.toISOString().split('T')[0];
  } else if (fsStart === 'today') {
    fsStart = new Date().toISOString().split('T')[0];
  }

  if (fsEnd === 'today') {
    fsEnd = new Date().toISOString().split('T')[0];
  }

  const { prevStart, prevEnd } = getPreviousPeriod(range, today);

  // Fetch real Google SEO Rankings from Search Console using strictly formatted dates
  const [gscResult, prevGscResult] = await Promise.all([
    fetchGSCTrend(SITE_URL, fsStart, fsEnd),
    compare ? fetchGSCTrend(SITE_URL, prevStart, prevEnd) : Promise.resolve({ timeSeriesData: [] })
  ]);
  let gscData = gscResult.timeSeriesData || [];
  let prevGscData = prevGscResult.timeSeriesData || [];

  // Fetch real LLM Visibility scores from Firebase
  let llmDataMap: Record<string, any> = {};
  let prevLlmDataMap: Record<string, any> = {};
  
  try {
    if (adminDb && typeof adminDb.collection === 'function') {
      const llmSnapshot = await adminDb.collection('llm_visibility')
        .where('date', '>=', fsStart)
        .where('date', '<=', fsEnd)
        .get();
      
      llmSnapshot.forEach((doc: any) => {
        const data = doc.data();
        llmDataMap[data.date] = {
          ChatGPT: data.chatgpt_score || 0,
          Claude: data.claude_score || 0,
          Gemini: data.gemini_score || 0
        };
      });

      if (compare) {
        const prevSnapshot = await adminDb.collection('llm_visibility')
          .where('date', '>=', prevStart)
          .where('date', '<=', prevEnd)
          .get();
        
        prevSnapshot.forEach((doc: any) => {
          const data = doc.data();
          prevLlmDataMap[data.date] = {
            ChatGPT: data.chatgpt_score || 0,
            Claude: data.claude_score || 0,
            Gemini: data.gemini_score || 0
          };
        });
      }
    }
  } catch (e) {
    console.error("Error fetching LLM data from Firebase", e);
  }

  // If the site is too new, GSC might return no data yet. 
  // We'll generate a dummy array with dates so the chart doesn't break, and set Google to 0.
  if (gscData.length === 0) {
    let days = 30;
    if (range === 'TM') days = today.getDate();
    else if (range === 'TW') days = today.getDay() + 1;
    else if (range === 'LW') days = 7;
    else if (range === 'LM') days = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    
    gscData = Array.from({ length: Math.max(days, 1) }).map((_, i) => {
      const d = new Date();
      if (range === 'LM') { d.setDate(0); d.setDate(d.getDate() - (days - 1 - i)); } 
      else { d.setDate(d.getDate() - (days - 1 - i)); }
      return {
        date: d.toISOString().split('T')[0],
        Google: 0,
        Clicks: 0,
        Impressions: 0
      };
    });
  }

  // Merge GSC data with Firebase LLM Data
  let mergedData = gscData.map((row) => ({
    ...row,
    ChatGPT: llmDataMap[row.date]?.ChatGPT || 0,
    Claude: llmDataMap[row.date]?.Claude || 0,
    Gemini: llmDataMap[row.date]?.Gemini || 0,
  }));

  // Apply granularity grouping (average for ranking scores)
  if (mergedData.length > 0) {
    mergedData = aggregateData(mergedData, granularity, 'average');
  }

  if (compare) {
    let mergedPrevData = prevGscData.map((row) => ({
      ...row,
      ChatGPT: prevLlmDataMap[row.date]?.ChatGPT || 0,
      Claude: prevLlmDataMap[row.date]?.Claude || 0,
      Gemini: prevLlmDataMap[row.date]?.Gemini || 0,
    }));
    
    if (mergedPrevData.length > 0) {
      mergedPrevData = aggregateData(mergedPrevData, granularity, 'average');
    }
    
    mergedData = mergeComparisonData(mergedData, mergedPrevData, ['Google', 'ChatGPT', 'Claude', 'Gemini']);
  }

  const avgGoogleRank = gscResult.totals?.avgPosition || '0.0';

  // Calculate averages for the cards
  let totalChatGPT = 0, totalClaude = 0;
  let count = 0;
  Object.values(llmDataMap).forEach((day: any) => {
    totalChatGPT += day.ChatGPT || 0;
    totalClaude += day.Claude || 0;
    count++;
  });
  
  const avgChatGPT = count > 0 ? Math.round(totalChatGPT / count) : 0;
  const avgClaude = count > 0 ? Math.round(totalClaude / count) : 0;

  return (
    <div id="dashboard-content" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Overview</h1>
          <p className="text-slate-500">Combined SEO and LLM Visibility Metrics</p>
        </div>
        <div className="flex items-center space-x-3">
          <Suspense fallback={<div className="h-8 w-32 bg-slate-100 rounded animate-pulse"></div>}>
            <DateFilter />
          </Suspense>
          <ExportControls data={mergedData} filename="Kids_DDS_Overview" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Google Search Avg Position" value={avgGoogleRank} change={0} />
        <StatCard title="ChatGPT Visibility" value={avgChatGPT.toString()} change={0} />
        <StatCard title="Claude Visibility" value={avgClaude.toString()} change={0} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Visibility Trend</h3>
            <p className="text-sm text-slate-500">Note: Google rankings are LIVE. LLM visibility updates nightly via the background cron job.</p>
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
