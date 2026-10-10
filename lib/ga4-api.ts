import { BetaAnalyticsDataClient } from '@google-analytics/data';

// Singleton instance
let analyticsDataClient: BetaAnalyticsDataClient | null = null;

function getClient() {
  if (!analyticsDataClient) {
    if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      console.warn("⚠️  Missing Google Cloud credentials for GA4 API");
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
  const client = getClient();
  if (!client) {
    return { error: 'Missing Google Analytics API credentials' };
  }

  // If requesting just today, we use the dateHour dimension so the chart has points
  const isOneDay = startDate === 'today' && endDate === 'today';
  const dimensionName = isOneDay ? 'dateHour' : 'date';

  try {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate,
          endDate,
        },
      ],
      dimensions: [
        { name: dimensionName },
      ],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
        { name: 'engagementRate' }
      ],
      orderBys: [
        {
          dimension: { dimensionName },
          desc: false,
        }
      ]
    });

    // Parse the response into our dashboard format
    const rows = response.rows || [];
    let totalUsers = 0;
    let totalSessions = 0;
    let totalPageViews = 0;
    let totalEngagement = 0;

    const timeSeriesData = rows.map(row => {
      // GA4 returns date as YYYYMMDD string, or YYYYMMDDHH for dateHour
      const dateStr = row.dimensionValues?.[0].value || '';
      let formattedDate = dateStr;
      
      if (isOneDay && dateStr.length === 10) {
        // Format as HH:00 for the chart X-axis
        formattedDate = `${dateStr.substring(8,10)}:00`;
      } else if (!isOneDay && dateStr.length === 8) {
        formattedDate = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
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

    const avgEngagementRate = rows.length > 0 
      ? ((totalEngagement / rows.length) * 100).toFixed(1) + '%' 
      : '0%';

    return {
      timeSeriesData,
      totals: {
        users: totalUsers,
        sessions: totalSessions,
        pageViews: totalPageViews,
        avgEngagementRate
      }
    };
  } catch (error: any) {
    console.error("Error fetching GA4 data:", error);
    return { error: error.message };
  }
}

export async function fetchGA4CityData(propertyId: string, startDate: string, endDate: string) {
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
      limit: 15
    });

    const rows = response.rows || [];
    return rows.map(row => ({
      city: row.dimensionValues?.[0].value || 'Unknown',
      sessions: parseInt(row.metricValues?.[0].value || '0'),
      users: parseInt(row.metricValues?.[1].value || '0')
    }));
  } catch (error: any) {
    console.error("Error fetching GA4 city data:", error);
    return [];
  }
}
