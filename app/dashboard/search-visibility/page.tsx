import StatCard from '@/components/dashboard/StatCard';
import VisibilityChart from '@/components/dashboard/VisibilityChart';
import ExportControls from '@/components/dashboard/ExportControls';
import DateFilter from '@/components/dashboard/DateFilter';
import { aggregateData, Granularity } from '@/lib/data-aggregation';
import { fetchGSCTrend, fetchTopQueries } from '@/lib/gsc-api';
import { getPreviousPeriod, mergeComparisonData } from '@/lib/date-utils';
import { Suspense } from 'react';

const SITE_URL = 'sc-domain:kidsdds.com';

export default async function SearchVisibility({
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
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    startDate = d.toISOString().split('T')[0];
    endDate = today.toISOString().split('T')[0];
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

  // Convert startDate and endDate to standard YYYY-MM-DD for GSC
  let gscStart = startDate;
  let gscEnd = endDate;
  
  if (gscStart === '30daysAgo') {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    gscStart = d.toISOString().split('T')[0];
  } else if (gscStart === 'today') {
    gscStart = new Date().toISOString().split('T')[0];
  }

  if (gscEnd === 'today') {
    gscEnd = new Date().toISOString().split('T')[0];
  }

  // Handle previous period
  const { prevStart, prevEnd } = getPreviousPeriod(range, today);
  
  // Fetch real data from Google Search Console
  const [gscResult, queryResult, prevGscResult] = await Promise.all([
    fetchGSCTrend(SITE_URL, gscStart, gscEnd),
    fetchTopQueries(SITE_URL, gscStart, gscEnd),
    compare ? fetchGSCTrend(SITE_URL, prevStart, prevEnd) : Promise.resolve({ timeSeriesData: [] })
  ]);

  let gscData = gscResult.timeSeriesData || [];
  let prevGscData = prevGscResult.timeSeriesData || [];
  
  if (gscData.length === 0) {
    let days = 30;
    if (range === 'TM') days = today.getDate();
    else if (range === 'TW') days = today.getDay() + 1;
    else if (range === 'LM') days = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
    
    gscData = Array.from({ length: Math.max(days, 1) }).map((_, i) => {
      const d = new Date();
      if (range === 'LM') { d.setDate(0); d.setDate(d.getDate() - (days - 1 - i)); } 
      else { d.setDate(d.getDate() - (days - 1 - i)); }
      return { date: d.toISOString().split('T')[0], Google: 0, Clicks: 0, Impressions: 0 };
    });
  }

  // Apply granularity grouping
  let chartData = aggregateData(gscData, granularity, 'average');
  
  if (compare) {
    let prevChartData = aggregateData(prevGscData, granularity, 'average');
    chartData = mergeComparisonData(chartData, prevChartData, ['Google']);
  }
  
  const avgGoogleRank = gscResult.totals?.avgPosition || '0.0';
  const totalClicks = gscResult.totals?.clicks || 0;
  const totalImpressions = gscResult.totals?.impressions || 0;

  return (
    <div id="dashboard-content" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Search Engine Visibility</h1>
          <p className="text-slate-500">Live rankings and queries from Google Search Console</p>
        </div>
        <div className="flex items-center space-x-3">
          <Suspense fallback={<div className="h-8 w-32 bg-slate-100 rounded animate-pulse"></div>}>
            <DateFilter />
          </Suspense>
          <ExportControls data={chartData} filename="Kids_DDS_Search_Visibility" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard title="Google Search Avg Position" value={avgGoogleRank} change={0} />
        <StatCard title="Total Google Clicks" value={totalClicks.toLocaleString()} change={0} />
        <StatCard title="Total Google Impressions" value={totalImpressions.toLocaleString()} change={0} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Google Position Trend</h3>
            <p className="text-sm text-slate-500">Live daily average search ranking (closer to 1 is better)</p>
          </div>
        </div>
        <VisibilityChart 
          data={chartData} 
          reversedY={true}
          domainY={[1, 'auto']}
          compare={compare}
          lines={[
            { key: 'Google', color: '#6B4BC8', name: 'Google Position' },
          ]} 
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">Top SEO Keywords</h3>
          <p className="text-sm text-slate-500">Live queries driving impressions in Google Search</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50">
              <tr>
                <th className="px-6 py-3 font-medium">Search Query</th>
                <th className="px-6 py-3 font-medium text-right">Avg Position</th>
                <th className="px-6 py-3 font-medium text-right">Clicks</th>
                <th className="px-6 py-3 font-medium text-right">Impressions</th>
                <th className="px-6 py-3 font-medium text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {queryResult.queries.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-4 text-center text-slate-500">Not enough data yet from Google Search Console. Check back in a few days.</td></tr>
              ) : (
                queryResult.queries.map((row: any, i: number) => {
                  const isTarget = row.query.toLowerCase().includes('pediatric dentist grayslake') || row.query.toLowerCase().includes('kids dentist grayslake');
                  return (
                  <tr key={i} className={`border-b border-slate-100 hover:bg-slate-50 ${isTarget ? 'bg-indigo-50/50' : 'bg-white'}`}>
                    <td className="px-6 py-4 font-medium text-slate-800">
                      {row.query}
                      {isTarget && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">⭐ Target SEO</span>}
                    </td>
                    <td className="px-6 py-4 text-right">{row.position}</td>
                    <td className="px-6 py-4 text-right">{row.clicks}</td>
                    <td className="px-6 py-4 text-right">{row.impressions}</td>
                    <td className="px-6 py-4 text-right">{row.ctr}</td>
                  </tr>
                )}
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
