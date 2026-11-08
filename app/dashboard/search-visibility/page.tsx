import StatCard from '@/components/dashboard/StatCard';
import VisibilityChart from '@/components/dashboard/VisibilityChart';
import ExportControls from '@/components/dashboard/ExportControls';
import DateFilter from '@/components/dashboard/DateFilter';
import { aggregateData } from '@/lib/data-aggregation';
import { fetchGSCTrend, fetchTopQueries } from '@/lib/gsc-api';
import {
  buildDateRangeArray,
  getDateRangeBounds,
  getPreviousPeriod,
  mergeComparisonData,
} from '@/lib/date-utils';
import { resolveFilterParams } from '@/lib/filter-prefs';
import { getActiveClientConfig } from '@/lib/clients';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default async function SearchVisibility({
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

  const siteUrl =
    activeClient.gscSiteUrl || (activeClient.domain ? `sc-domain:${activeClient.domain}` : '');
  const targetKeywords = (activeClient.targetKeywords || []).map(k => k.toLowerCase());

  const today = new Date();
  const { startDate: gscStart, endDate: gscEnd } = getDateRangeBounds(range, today, start, end);
  const { prevStart, prevEnd } = getPreviousPeriod(range, today, start, end);

  const [gscResult, queryResult, prevGscResult] = await Promise.all([
    siteUrl
      ? fetchGSCTrend(siteUrl, gscStart, gscEnd)
      : Promise.resolve({ timeSeriesData: [], totals: { avgPosition: '0.0', clicks: 0, impressions: 0 } }),
    siteUrl ? fetchTopQueries(siteUrl, gscStart, gscEnd) : Promise.resolve({ queries: [] }),
    compare && prevStart && prevEnd && siteUrl
      ? fetchGSCTrend(siteUrl, prevStart, prevEnd)
      : Promise.resolve({ timeSeriesData: [] }),
  ]);

  let gscData = gscResult.timeSeriesData || [];
  let prevGscData = prevGscResult.timeSeriesData || [];

  if (gscData.length === 0) {
    gscData = buildDateRangeArray(gscStart, gscEnd).map(dateStr => ({
      date: dateStr,
      Google: 0,
      Clicks: 0,
      Impressions: 0,
    }));
  }

  let chartData = aggregateData(gscData, granularity, 'average');

  if (compare) {
    let prevChartData = aggregateData(prevGscData, granularity, 'average');
    chartData = mergeComparisonData(chartData, prevChartData, ['Google']);
  }

  const avgGoogleRank = gscResult.totals?.avgPosition || '0.0';
  const totalClicks = gscResult.totals?.clicks || 0;
  const totalImpressions = gscResult.totals?.impressions || 0;
  const exportPrefix = activeClient.name.replace(/[^a-zA-Z0-9]+/g, '_');

  return (
    <div id="dashboard-content" className="space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
            Search Engine Visibility — {activeClient.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Live rankings and queries from Google Search Console ({siteUrl || 'No GSC URL configured'})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Suspense fallback={<div className="h-8 w-32 bg-slate-100 rounded animate-pulse"></div>}>
            <DateFilter />
          </Suspense>
          <ExportControls data={chartData} filename={`${exportPrefix}_Search_Visibility`} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
        <StatCard title="Google Search Avg Position" value={avgGoogleRank} change={0} />
        <StatCard title="Total Google Clicks" value={totalClicks.toLocaleString()} change={0} />
        <StatCard
          title="Total Google Impressions"
          value={totalImpressions.toLocaleString()}
          change={0}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="mb-3 sm:mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-800">
              Google Position Trend
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Live daily average search ranking (closer to 1 is better)
            </p>
          </div>
        </div>
        <VisibilityChart
          data={chartData}
          reversedY={true}
          domainY={[1, 'auto']}
          compare={compare}
          lines={[{ key: 'Google', color: '#6B4BC8', name: 'Google Position' }]}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <h3 className="text-base sm:text-lg font-semibold text-slate-800">Top SEO Keywords</h3>
          <p className="text-xs sm:text-sm text-slate-500">
            Live queries driving impressions in Google Search
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-left text-slate-600">
            <thead className="text-[11px] sm:text-xs text-slate-500 uppercase bg-slate-50">
              <tr>
                <th className="px-3.5 sm:px-6 py-3 font-medium">Search Query</th>
                <th className="px-3 sm:px-6 py-3 font-medium text-right">Pos</th>
                <th className="px-3 sm:px-6 py-3 font-medium text-right">Clicks</th>
                <th className="px-3 sm:px-6 py-3 font-medium text-right">Impr</th>
                <th className="px-3.5 sm:px-6 py-3 font-medium text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {queryResult.queries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 sm:px-6 py-4 text-center text-slate-500">
                    Not enough data yet from Google Search Console.
                  </td>
                </tr>
              ) : (
                queryResult.queries.map((row: any, i: number) => {
                  const qLower = row.query.toLowerCase();
                  const isTarget = targetKeywords.some(tk => qLower.includes(tk));
                  return (
                    <tr
                      key={i}
                      className={`border-b border-slate-100 hover:bg-slate-50 ${
                        isTarget ? 'bg-indigo-50/50' : 'bg-white'
                      }`}
                    >
                      <td className="px-3.5 sm:px-6 py-3 sm:py-4 font-medium text-slate-800">
                        {row.query}
                        {isTarget && (
                          <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium bg-indigo-100 text-indigo-800">
                            ⭐ Target
                          </span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">{row.position}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">{row.clicks}</td>
                      <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">{row.impressions}</td>
                      <td className="px-3.5 sm:px-6 py-3 sm:py-4 text-right">{row.ctr}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
