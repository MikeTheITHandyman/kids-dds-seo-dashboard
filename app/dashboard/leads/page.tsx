import StatCard from '@/components/dashboard/StatCard';
import VisibilityChart from '@/components/dashboard/VisibilityChart';
import ExportControls from '@/components/dashboard/ExportControls';
import DateFilter from '@/components/dashboard/DateFilter';
import FormTypeFilter from '@/components/dashboard/FormTypeFilter';
import GA4LeadEventsSelector from '@/components/dashboard/GA4LeadEventsSelector';
import { aggregateData } from '@/lib/data-aggregation';
import { fetchSanityFormSubmissions, FormFilterType } from '@/lib/sanity-api';
import { fetchGA4KeyEventsSeries } from '@/lib/ga4-api';
import { getDateRangeBounds, getPreviousPeriod, mergeComparisonData } from '@/lib/date-utils';
import { resolveFilterParams } from '@/lib/filter-prefs';
import { auth } from '@/auth';
import { getActiveClientConfig, isSuperAdminEmail } from '@/lib/clients';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

const EVENT_COLORS = ['#EF6C1A', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

function calcPercentChange(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

export default async function FormLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    granularity?: string;
    start?: string;
    end?: string;
    compare?: string;
    formType?: string;
  }>;
}) {
  const [resolvedParams, session, activeClient] = await Promise.all([
    searchParams,
    auth(),
    getActiveClientConfig(),
  ]);

  const currentEmail = session?.user?.email?.toLowerCase().trim() || '';
  const currentRole = (session?.user as any)?.role || 'ANALYST';
  const isAdmin =
    currentRole === 'SUPER_ADMIN' ||
    currentRole === 'ADMIN' ||
    isSuperAdminEmail(currentEmail);

  const { range, granularity, start, end, compare } = await resolveFilterParams(resolvedParams);
  const today = new Date();
  const { startDate, endDate } = getDateRangeBounds(range, today, start, end);
  const isOneDay = range === '1D';
  const { prevStart, prevEnd } = getPreviousPeriod(range, today, start, end);

  const leadSource = activeClient.leadsConfig?.source || 'ga4_events';
  const exportPrefix = activeClient.name.replace(/[^a-zA-Z0-9]+/g, '_');

  // MODE 1: Google Analytics 4 Key Events Lead Tracking
  if (leadSource === 'ga4_events') {
    const selectedEvents = activeClient.leadsConfig?.selectedGa4Events || [];
    const [ga4Leads, prevGa4Leads] = await Promise.all([
      fetchGA4KeyEventsSeries(
        activeClient.ga4PropertyId,
        selectedEvents,
        startDate,
        endDate,
        isOneDay
      ),
      prevStart && prevEnd
        ? fetchGA4KeyEventsSeries(
            activeClient.ga4PropertyId,
            selectedEvents,
            prevStart,
            prevEnd,
            isOneDay
          )
        : Promise.resolve({ timeSeriesData: [], totalsByEvent: {}, totalCount: 0 }),
    ]);

    let timeSeriesData: any[] = ga4Leads.timeSeriesData || [];
    let prevTimeSeriesData: any[] = prevGa4Leads.timeSeriesData || [];

    if (timeSeriesData.length > 0 && !isOneDay) {
      timeSeriesData = aggregateData(timeSeriesData, granularity, 'sum');
    }

    const lineKeys = ['Total', ...selectedEvents];
    if (compare) {
      if (prevTimeSeriesData.length > 0 && !isOneDay) {
        prevTimeSeriesData = aggregateData(prevTimeSeriesData, granularity, 'sum');
      }
      timeSeriesData = mergeComparisonData(timeSeriesData, prevTimeSeriesData, lineKeys);
    }

    const totalChange = calcPercentChange(ga4Leads.totalCount, prevGa4Leads.totalCount);
    const chartLines = [
      { key: 'Total', color: '#6B4BC8', name: 'Total Key Events' },
      ...selectedEvents.map((ev, i) => ({
        key: ev,
        color: EVENT_COLORS[i % EVENT_COLORS.length],
        name: ev,
      })),
    ];

    const pct = (count: number) =>
      ga4Leads.totalCount > 0 ? Math.round((count / ga4Leads.totalCount) * 100) : 0;

    return (
      <div id="dashboard-content" className="space-y-4 sm:space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
              Leads &amp; GA4 Key Events — {activeClient.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Live Google Analytics 4 Key Events &amp; conversions ({startDate} to {endDate})
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Suspense fallback={<div className="h-8 w-32 bg-slate-100 rounded animate-pulse"></div>}>
              <DateFilter />
            </Suspense>
            <ExportControls data={timeSeriesData} filename={`${exportPrefix}_GA4_Key_Events`} />
          </div>
        </div>

        {/* GA4 Key Events Selector Tool */}
        <GA4LeadEventsSelector client={activeClient} isAdmin={isAdmin} />

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <StatCard
            title="Total Selected Key Events"
            value={ga4Leads.totalCount.toLocaleString()}
            change={totalChange}
          />
          {selectedEvents.slice(0, 3).map(ev => {
            const cur = ga4Leads.totalsByEvent[ev] || 0;
            const prev = (prevGa4Leads.totalsByEvent as Record<string, number>)[ev] || 0;
            return (
              <StatCard
                key={ev}
                title={ev}
                value={cur.toLocaleString()}
                change={calcPercentChange(cur, prev)}
              />
            );
          })}
        </div>

        {/* Time-Series Trend Chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
          <div className="mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-semibold text-slate-800">
              GA4 Key Events Over Time
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Daily conversion volume across your selected Google Analytics 4 Key Events
            </p>
          </div>
          <VisibilityChart
            data={timeSeriesData}
            reversedY={false}
            domainY={[0, 'auto']}
            compare={compare}
            lines={chartLines}
          />
        </div>

        {/* Breakdown by Selected GA4 Event */}
        {selectedEvents.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-6">
            <div className="mb-4">
              <h3 className="text-base sm:text-lg font-semibold text-slate-800">
                Breakdown by GA4 Key Event
              </h3>
              <p className="text-xs sm:text-sm text-slate-500">
                Distribution of {ga4Leads.totalCount.toLocaleString()} total conversion events
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              {selectedEvents.map((ev, i) => {
                const count = ga4Leads.totalsByEvent[ev] || 0;
                const color = EVENT_COLORS[i % EVENT_COLORS.length];
                return (
                  <div key={ev} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-semibold text-slate-700 flex items-center gap-2 font-mono text-xs">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        {ev}
                      </span>
                      <span className="text-slate-600 font-medium text-xs">
                        {count.toLocaleString()} ({pct(count)}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5">
                      <div
                        className="h-2.5 rounded-full transition-all"
                        style={{ width: `${pct(count)}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // MODE 2: Sanity Form Submissions (Default for Kids Dentist, with option to switch to GA4 Key Events)
  const rawFormType = resolvedParams.formType || 'all';
  const formType: FormFilterType =
    rawFormType === 'appointment' || rawFormType === 'ask-doctor' || rawFormType === 'contact'
      ? rawFormType
      : 'all';

  const [leadsResult, prevLeadsResult] = await Promise.all([
    fetchSanityFormSubmissions(startDate, endDate, isOneDay),
    prevStart && prevEnd
      ? fetchSanityFormSubmissions(prevStart, prevEnd, isOneDay)
      : Promise.resolve({
          timeSeriesData: [],
          totals: { total: 0, appointment: 0, askDoctor: 0, contact: 0 },
        }),
  ]);

  let timeSeriesData: any[] = leadsResult.timeSeriesData || [];
  let prevTimeSeriesData: any[] = prevLeadsResult.timeSeriesData || [];

  if (timeSeriesData.length > 0 && !isOneDay) {
    timeSeriesData = aggregateData(timeSeriesData, granularity, 'sum');
  }

  if (compare) {
    if (prevTimeSeriesData.length > 0 && !isOneDay) {
      prevTimeSeriesData = aggregateData(prevTimeSeriesData, granularity, 'sum');
    }
    timeSeriesData = mergeComparisonData(timeSeriesData, prevTimeSeriesData, [
      'Total',
      'Appointment',
      'AskDoctor',
      'Contact',
    ]);
  }

  const totals = leadsResult.totals;
  const prevTotals = prevLeadsResult.totals;

  const totalChange = calcPercentChange(totals.total, prevTotals.total);
  const appointmentChange = calcPercentChange(totals.appointment, prevTotals.appointment);
  const askDoctorChange = calcPercentChange(totals.askDoctor, prevTotals.askDoctor);
  const contactChange = calcPercentChange(totals.contact, prevTotals.contact);

  const allLines = [
    { key: 'Total', color: '#6B4BC8', name: 'Total Submissions' },
    { key: 'Appointment', color: '#EF6C1A', name: 'Appointment Request' },
    { key: 'AskDoctor', color: '#10b981', name: 'Ask the Dentist' },
    { key: 'Contact', color: '#3b82f6', name: 'Contact Us' },
  ];

  const activeLines =
    formType === 'appointment'
      ? [{ key: 'Appointment', color: '#EF6C1A', name: 'Appointment Request' }]
      : formType === 'ask-doctor'
      ? [{ key: 'AskDoctor', color: '#10b981', name: 'Ask the Dentist' }]
      : formType === 'contact'
      ? [{ key: 'Contact', color: '#3b82f6', name: 'Contact Us' }]
      : allLines;

  const selectedLabel =
    formType === 'appointment'
      ? 'Appointment Requests'
      : formType === 'ask-doctor'
      ? 'Ask the Dentist Submissions'
      : formType === 'contact'
      ? 'Contact Us Submissions'
      : 'All Form Submissions';

  const selectedCount =
    formType === 'appointment'
      ? totals.appointment
      : formType === 'ask-doctor'
      ? totals.askDoctor
      : formType === 'contact'
      ? totals.contact
      : totals.total;

  const pct = (count: number) =>
    totals.total > 0 ? Math.round((count / totals.total) * 100) : 0;

  return (
    <div id="dashboard-content" className="space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
            Form Submissions &amp; Leads — {activeClient.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Live conversion events ({startDate} to {endDate})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Suspense
            fallback={<div className="h-8 w-32 bg-slate-100 rounded animate-pulse"></div>}
          >
            <DateFilter />
          </Suspense>
          <ExportControls data={timeSeriesData} filename={`${exportPrefix}_Form_Leads`} />
        </div>
      </div>

      {/* GA4 Key Events / Lead Source Selector */}
      <GA4LeadEventsSelector client={activeClient} isAdmin={isAdmin} />

      {/* Form Type Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Suspense
          fallback={<div className="h-10 w-80 bg-slate-100 rounded-xl animate-pulse"></div>}
        >
          <FormTypeFilter />
        </Suspense>
        {formType !== 'all' && (
          <div className="text-xs sm:text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-xs">
            Showing <strong className="text-slate-900">{selectedLabel}</strong>:{' '}
            <span className="font-bold text-[#6B4BC8]">{selectedCount.toLocaleString()}</span> in
            selected timeframe
          </div>
        )}
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <div
          className={`rounded-xl transition-all ${
            formType === 'all' ? 'ring-2 ring-[#6B4BC8]/30' : ''
          }`}
        >
          <StatCard
            title="Total Form Submissions"
            value={totals.total.toLocaleString()}
            change={totalChange}
          />
        </div>
        <div
          className={`rounded-xl transition-all ${
            formType === 'appointment' ? 'ring-2 ring-[#EF6C1A]/50' : ''
          }`}
        >
          <StatCard
            title="Appointment Requests"
            value={totals.appointment.toLocaleString()}
            change={appointmentChange}
          />
        </div>
        <div
          className={`rounded-xl transition-all ${
            formType === 'ask-doctor' ? 'ring-2 ring-emerald-500/50' : ''
          }`}
        >
          <StatCard
            title="Ask the Dentist"
            value={totals.askDoctor.toLocaleString()}
            change={askDoctorChange}
          />
        </div>
        <div
          className={`rounded-xl transition-all ${
            formType === 'contact' ? 'ring-2 ring-blue-500/50' : ''
          }`}
        >
          <StatCard
            title="Contact Us"
            value={totals.contact.toLocaleString()}
            change={contactChange}
          />
        </div>
      </div>

      {/* Time-Series Trend Chart */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs">
        <div className="mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-800">
              {selectedLabel} Over Time
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Number of form submission events recorded across the selected timeframe
            </p>
          </div>
        </div>
        <VisibilityChart
          data={timeSeriesData}
          reversedY={false}
          domainY={[0, 'auto']}
          compare={compare}
          lines={activeLines}
        />
      </div>

      {/* Breakdown by Form Type */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-6">
        <div className="mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-slate-800">
            Submission Breakdown by Form Type
          </h3>
          <p className="text-xs sm:text-sm text-slate-500">
            Distribution of the {totals.total.toLocaleString()} total submissions in this period
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF6C1A]"></span>
                Appointment Request
              </span>
              <span className="text-slate-600 font-medium">
                {totals.appointment.toLocaleString()} ({pct(totals.appointment)}%)
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5">
              <div
                className="bg-[#EF6C1A] h-2.5 rounded-full transition-all"
                style={{ width: `${pct(totals.appointment)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">Route: /request-appointment</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
                Ask the Dentist
              </span>
              <span className="text-slate-600 font-medium">
                {totals.askDoctor.toLocaleString()} ({pct(totals.askDoctor)}%)
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5">
              <div
                className="bg-[#10b981] h-2.5 rounded-full transition-all"
                style={{ width: `${pct(totals.askDoctor)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">Route: /ask-us-a-question</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-semibold text-slate-700 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]"></span>
                Contact Us
              </span>
              <span className="text-slate-600 font-medium">
                {totals.contact.toLocaleString()} ({pct(totals.contact)}%)
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2.5">
              <div
                className="bg-[#3b82f6] h-2.5 rounded-full transition-all"
                style={{ width: `${pct(totals.contact)}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">Route: /contact</p>
          </div>
        </div>
      </div>
    </div>
  );
}
