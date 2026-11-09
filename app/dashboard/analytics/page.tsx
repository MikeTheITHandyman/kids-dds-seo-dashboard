import StatCard from '@/components/dashboard/StatCard';
import VisibilityChart from '@/components/dashboard/VisibilityChart';
import ExportControls from '@/components/dashboard/ExportControls';
import DateFilter from '@/components/dashboard/DateFilter';
import { aggregateData } from '@/lib/data-aggregation';
import { fetchGA4Data, fetchGA4CityData, fetchGA4AcquisitionData } from '@/lib/ga4-api';
import { getDateRangeBounds, getPreviousPeriod, mergeComparisonData } from '@/lib/date-utils';
import { resolveFilterParams } from '@/lib/filter-prefs';
import { getActiveClientConfig } from '@/lib/clients';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

const CHANNEL_COLORS = [
  '#6B4BC8', // Purple
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#64748b', // Slate
];

function formatChannelLabel(channel: string): string {
  switch (channel) {
    case 'Organic Search':
      return 'Organic Search (Google/Bing)';
    case 'Direct':
      return 'Direct (Typed URL/Bookmarks)';
    case 'Referral':
      return 'Referral (Other websites)';
    case 'Organic Social':
    case 'Paid Social':
      return `${channel} (Facebook/Instagram)`;
    default:
      return channel;
  }
}

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

  const [ga4Result, topCities, acquisitionChannels, prevGa4Result] = await Promise.all([
    fetchGA4Data(propertyId, ga4StartDate, ga4EndDate),
    fetchGA4CityData(propertyId, ga4StartDate, ga4EndDate),
    fetchGA4AcquisitionData(propertyId, ga4StartDate, ga4EndDate),
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
  const serviceAccountEmail = process.env.FIREBASE_CLIENT_EMAIL || '';

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

      {ga4Result.error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs sm:text-sm text-amber-900 space-y-1">
          <div className="font-bold">
            Google Analytics 4 Connection Notice (Property ID: {propertyId || 'None'})
          </div>
          <p className="text-amber-800">{ga4Result.error}</p>
          {serviceAccountEmail && (
            <p className="text-amber-800 pt-1">
              Make sure <strong>Viewer</strong> access is granted in{' '}
              <strong>GA4 → Admin → Property → Property access management</strong> to:{' '}
              <code className="bg-white px-1.5 py-0.5 rounded border border-amber-300 font-mono text-[11px]">
                {serviceAccountEmail}
              </code>
            </p>
          )}
        </div>
      )}

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

        {/* Live GA4 Acquisition Breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-6 flex flex-col">
          <div className="mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-slate-800">User Acquisition</h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Where your traffic is coming from (GA4 Session Default Channel Group)
            </p>
          </div>
          {acquisitionChannels.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8 text-xs sm:text-sm text-slate-400">
              No acquisition channel data available for this date range
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center space-y-4">
              {acquisitionChannels.map((item, idx) => {
                const color = CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
                return (
                  <div key={item.channel}>
                    <div className="flex items-center justify-between text-xs sm:text-sm mb-1 gap-2">
                      <span className="font-medium text-slate-700 truncate">
                        {formatChannelLabel(item.channel)}
                      </span>
                      <span className="text-slate-500 shrink-0 font-mono text-xs">
                        {formatNum(item.sessions)} sessions ({item.percentage}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="h-2.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(item.percentage, item.sessions > 0 ? 2 : 0)}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
