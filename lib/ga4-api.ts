import { BetaAnalyticsDataClient } from '@google-analytics/data';

// Singleton instance
let analyticsDataClient: BetaAnalyticsDataClient | null = null;

function getClient() {
  if (!analyticsDataClient) {
    if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      console.warn('⚠️  Missing Google Cloud credentials for GA4 API');
      return null;
    }

    analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
  return analyticsDataClient;
}

export async function fetchGA4Data(propertyId: string, startDate: string, endDate: string) {
  if (!propertyId) {
    return { error: 'No GA4 Property ID configured for this client' };
  }
  const client = getClient();
  if (!client) {
    return { error: 'Missing Google Analytics API credentials' };
  }

  const isOneDay = startDate === 'today' && endDate === 'today';
  const dimensionName = isOneDay ? 'dateHour' : 'date';

  try {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimensionName }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'engagementRate' },
      ],
      orderBys: [
        {
          dimension: { dimensionName },
          desc: false,
        },
      ],
    });

    const rows = response.rows || [];
    let totalUsers = 0;
    let totalSessions = 0;
    let totalPageViews = 0;
    let totalEngagement = 0;

    const timeSeriesData = rows.map(row => {
      const dateStr = row.dimensionValues?.[0].value || '';
      let formattedDate = dateStr;

      if (isOneDay && dateStr.length === 10) {
        formattedDate = `${dateStr.substring(8, 10)}:00`;
      } else if (!isOneDay && dateStr.length === 8) {
        formattedDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }

      const users = parseInt(row.metricValues?.[0].value || '0');
      const sessions = parseInt(row.metricValues?.[1].value || '0');
      const pageViews = parseInt(row.metricValues?.[2].value || '0');
      const engRate = parseFloat(row.metricValues?.[3].value || '0');

      totalUsers += users;
      totalSessions += sessions;
      totalPageViews += pageViews;
      totalEngagement += engRate;

      return {
        date: formattedDate,
        Users: users,
        Sessions: sessions,
        Pageviews: pageViews,
      };
    });

    const avgEngagementRate =
      rows.length > 0 ? ((totalEngagement / rows.length) * 100).toFixed(1) + '%' : '0%';

    return {
      timeSeriesData,
      totals: {
        users: totalUsers,
        sessions: totalSessions,
        pageViews: totalPageViews,
        avgEngagementRate,
      },
    };
  } catch (error: any) {
    console.error('Error fetching GA4 data:', error);
    return { error: error.message };
  }
}

export async function fetchGA4CityData(propertyId: string, startDate: string, endDate: string) {
  if (!propertyId) return [];
  const client = getClient();
  if (!client) {
    return [];
  }

  try {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'city' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 15,
    });

    const rows = response.rows || [];
    return rows.map(row => ({
      city: row.dimensionValues?.[0].value || 'Unknown',
      sessions: parseInt(row.metricValues?.[0].value || '0'),
      users: parseInt(row.metricValues?.[1].value || '0'),
    }));
  } catch (error: any) {
    console.error('Error fetching GA4 city data:', error);
    return [];
  }
}

export interface GA4DiscoveredEvent {
  eventName: string;
  eventCount: number;
  users: number;
}

/**
 * Discovers all GA4 events recorded in the property so the admin can select Key Events / Lead Events.
 */
export async function fetchGA4AvailableEvents(
  propertyId: string,
  startDate: string = '90daysAgo',
  endDate: string = 'today'
): Promise<{ events: GA4DiscoveredEvent[]; error?: string }> {
  if (!propertyId) {
    return { events: [], error: 'No GA4 Property ID configured' };
  }
  const client = getClient();
  if (!client) {
    return { events: [], error: 'Missing Google Analytics API credentials' };
  }

  try {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 100,
    });

    const rows = response.rows || [];
    const events: GA4DiscoveredEvent[] = rows
      .map(row => ({
        eventName: row.dimensionValues?.[0]?.value || '',
        eventCount: parseInt(row.metricValues?.[0]?.value || '0', 10),
        users: parseInt(row.metricValues?.[1]?.value || '0', 10),
      }))
      .filter(e => Boolean(e.eventName));

    return { events };
  } catch (error: any) {
    console.error('Error fetching GA4 available events:', error);
    return { events: [], error: error.message };
  }
}

export interface GA4KeyEventsResult {
  timeSeriesData: Record<string, any>[];
  totalsByEvent: Record<string, number>;
  totalCount: number;
  error?: string;
}

/**
 * Queries time-series counts for a client's selected GA4 Key Events / Lead Events.
 */
export async function fetchGA4KeyEventsSeries(
  propertyId: string,
  selectedEvents: string[],
  startDate: string,
  endDate: string,
  isOneDay: boolean = false
): Promise<GA4KeyEventsResult> {
  if (!propertyId) {
    return {
      timeSeriesData: [],
      totalsByEvent: {},
      totalCount: 0,
      error: 'No GA4 Property ID configured for this client',
    };
  }
  if (!selectedEvents || selectedEvents.length === 0) {
    return {
      timeSeriesData: [],
      totalsByEvent: {},
      totalCount: 0,
    };
  }

  const client = getClient();
  if (!client) {
    return {
      timeSeriesData: [],
      totalsByEvent: {},
      totalCount: 0,
      error: 'Missing Google Analytics API credentials',
    };
  }

  const dimensionName = isOneDay ? 'dateHour' : 'date';

  try {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimensionName }, { name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: {
            values: selectedEvents,
          },
        },
      },
      orderBys: [{ dimension: { dimensionName }, desc: false }],
      limit: 10000,
    });

    const buckets: Record<string, Record<string, any>> = {};
    const totalsByEvent: Record<string, number> = {};
    selectedEvents.forEach(ev => {
      totalsByEvent[ev] = 0;
    });

    if (isOneDay) {
      for (let h = 0; h < 24; h++) {
        const hourKey = `${String(h).padStart(2, '0')}:00`;
        buckets[hourKey] = { date: hourKey, Total: 0 };
        selectedEvents.forEach(ev => {
          buckets[hourKey][ev] = 0;
        });
      }
    } else {
      const cursor = new Date(`${startDate}T00:00:00`);
      const last = new Date(`${endDate}T00:00:00`);
      if (!isNaN(cursor.getTime()) && !isNaN(last.getTime())) {
        while (cursor <= last) {
          const y = cursor.getFullYear();
          const m = String(cursor.getMonth() + 1).padStart(2, '0');
          const d = String(cursor.getDate()).padStart(2, '0');
          const key = `${y}-${m}-${d}`;
          buckets[key] = { date: key, Total: 0 };
          selectedEvents.forEach(ev => {
            buckets[key][ev] = 0;
          });
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    let totalCount = 0;
    const rows = response.rows || [];

    for (const row of rows) {
      const rawDate = row.dimensionValues?.[0]?.value || '';
      const eventName = row.dimensionValues?.[1]?.value || '';
      const count = parseInt(row.metricValues?.[0]?.value || '0', 10);

      if (!eventName || !selectedEvents.includes(eventName)) continue;

      let formattedDate = rawDate;
      if (isOneDay && rawDate.length === 10) {
        formattedDate = `${rawDate.substring(8, 10)}:00`;
      } else if (!isOneDay && rawDate.length === 8) {
        formattedDate = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
      }

      if (!buckets[formattedDate]) {
        buckets[formattedDate] = { date: formattedDate, Total: 0 };
        selectedEvents.forEach(ev => {
          buckets[formattedDate][ev] = 0;
        });
      }

      buckets[formattedDate][eventName] = (buckets[formattedDate][eventName] || 0) + count;
      buckets[formattedDate].Total = (buckets[formattedDate].Total || 0) + count;
      totalsByEvent[eventName] = (totalsByEvent[eventName] || 0) + count;
      totalCount += count;
    }

    const timeSeriesData = Object.keys(buckets)
      .sort()
      .map(k => buckets[k]);

    return {
      timeSeriesData,
      totalsByEvent,
      totalCount,
    };
  } catch (error: any) {
    console.error('Error fetching GA4 Key Events series:', error);
    return {
      timeSeriesData: [],
      totalsByEvent: {},
      totalCount: 0,
      error: error.message,
    };
  }
}
