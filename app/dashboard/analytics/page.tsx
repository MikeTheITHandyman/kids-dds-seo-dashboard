import StatCard from '@/components/dashboard/StatCard';
import VisibilityChart from '@/components/dashboard/VisibilityChart';
import ExportControls from '@/components/dashboard/ExportControls';
import DateFilter from '@/components/dashboard/DateFilter';
import { aggregateData } from '@/lib/data-aggregation';
import { fetchGA4Data, fetchGA4CityData } from '@/lib/ga4-api';
import { getDateRangeBounds, getPreviousPeriod, mergeComparisonData } from '@/lib/date-utils';
import { resolveFilterParams } from '@/lib/filter-prefs';
import { getActiveClientConfig } from '@/lib/clients';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

export default async function WebAnalytics({
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

  const propertyId = activeClient.ga4PropertyId || '';

  const today = new Date();
  const { ga4StartDate, ga4EndDate } = getDateRangeBounds(range, today, start, end);
  const { prevStart, prevEnd } = getPreviousPeriod(range, today, start, end);

  const [ga4Result, topCities, prevGa4Result] = await Promise.all([
    fetchGA4Data(propertyId, ga4StartDate, ga4EndDate),
    fetchGA4CityData(propertyId, ga4StartDate, ga4EndDate),
    compare && prevStart && prevEnd && propertyId
      ? fetchGA4Data(propertyId, prevStart, prevEnd)
      : Promise.resolve({ timeSeriesData: [] }),
  ]);

  let timeSeriesData = ga4Result.timeSeriesData || [];
  let prevTimeSeriesData = prevGa4Result.timeSeriesData || [];

  if (timeSeriesData.length > 0 && range !== '1D') {
    timeSeriesData = aggregateData(timeSeriesData, granularity, 'sum');
  }

  if (compare) {
    if (prevTimeSeriesData.length > 0 && range !== '1D') {
      prevTimeSeriesData = aggregateData(prevTimeSeriesData, granularity, 'sum');
    }
    timeSeriesData = mergeComparisonData(timeSeriesData, prevTimeSeriesData, [
      'Users',
      'Sessions',
      'Pageviews',
    ]);
  }

  const formatNum = (num: number) => num.toLocaleString('en-US');

  const totals = ga4Result.totals || {
    users: 0,
    sessions: 0,
    pageViews: 0,
    avgEngagementRate: '0%',
  };
  const exportPrefix = activeClient.name.replace(/[^a-zA-Z0-9]+/g, '_');

  return (
    <div id="dashboard-content" className="space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
            Traffic &amp; Web Analytics — {activeClient.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Google Analytics 4 Metrics (Property ID: {propertyId || 'Not Configured'})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Suspense fallback={<div className="h-8 w-32 bg-slate-100 rounded animate-pulse"></div>}>
            <DateFilter />
          </Suspense>
          <ExportControls data={timeSeriesData} filename={`${exportPrefix}_Web_Analytics`} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <StatCard title="Unique Users" value={formatNum(totals.users)} change={0} />
        <StatCard title="Total Sessions" value={formatNum(totals.sessions)} change={0} />
        <StatCard title="Pageviews" value={formatNum(totals.pageViews)} change={0} />
        <StatCard title="Engagement Rate" value={totals.avgEngagementRate} change={0} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-slate-800">Traffic Overview</h3>
          <p className="text-xs sm:text-sm text-slate-500">
            Users, Sessions, and Pageviews over time
          </p>
        </div>
        <VisibilityChart
          data={timeSeriesData}
          reversedY={false}
          domainY={['auto', 'auto']}
          compare={compare}
          lines={[
            { key: 'Pageviews', color: '#94a3b8', name: 'Pageviews' },
            { key: 'Sessions', color: '#10b981', name: 'Sessions' },
            { key: 'Users', color: '#6B4BC8', name: 'Unique Users' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Top Local Cities Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100">
            <h3 className="text-base sm:text-lg font-semibold text-slate-800">Top Local Cities</h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Where your visitors are physically located
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left text-slate-600">
              <thead className="text-[11px] sm:text-xs text-slate-500 uppercase bg-slate-50">
                <tr>
                  <th className="px-4 sm:px-6 py-3 font-medium">City</th>
                  <th className="px-4 sm:px-6 py-3 font-medium text-right">Sessions</th>
                  <th className="px-4 sm:px-6 py-3 font-medium text-right">Users</th>
                </tr>
              </thead>
              <tbody>
                {topCities.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 sm:px-6 py-8 text-center text-slate-400">
                      No location data available yet
                    </td>
                  </tr>
                )}
                {topCities.map((row: any, i: number) => (
                  <tr
                    key={i}
                    className="bg-white border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 sm:px-6 py-3 sm:py-4 font-medium text-slate-800">
                      {row.city}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">{row.sessions}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">{row.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Acquisition Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-800">User Acquisition</h3>
            <p className="text-sm text-slate-500">Where your traffic is coming from</p>
          </div>
          <div className="flex-1 flex flex-col justify-center space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-slate-700">Organic Search (Google/Bing)</span>
                <span className="text-slate-500">65%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div className="bg-[#6B4BC8] h-2.5 rounded-full" style={{ width: '65%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-slate-700">Direct (Typed URL/Bookmarks)</span>
                <span className="text-slate-500">22%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div className="bg-[#10b981] h-2.5 rounded-full" style={{ width: '22%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-slate-700">Referral (Other websites)</span>
                <span className="text-slate-500">8%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div className="bg-[#f59e0b] h-2.5 rounded-full" style={{ width: '8%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-slate-700">Social (Facebook/Instagram)</span>
                <span className="text-slate-500">5%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2.5">
                <div className="bg-[#3b82f6] h-2.5 rounded-full" style={{ width: '5%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
