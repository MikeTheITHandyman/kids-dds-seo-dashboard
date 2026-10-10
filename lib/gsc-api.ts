import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

function getAuthClient() {
  if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return null;
  }
  
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
  });
}

export async function fetchGSCTrend(siteUrl: string, startDate: string, endDate: string) {
  const auth = getAuthClient();
  if (!auth) {
    return { error: 'Missing Google Cloud credentials for GSC API' };
  }

  const searchconsole = google.searchconsole({ version: 'v1', auth });

  try {
    const res = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['date'],
      },
    });

    const rows = res.data.rows || [];
    
    let totalClicks = 0;
    let totalImpressions = 0;
    let totalPosition = 0;
    
    const timeSeriesData = rows.map(row => {
      const clicks = row.clicks || 0;
      const impressions = row.impressions || 0;
      const position = row.position || 0;
      
      totalClicks += clicks;
      totalImpressions += impressions;
      totalPosition += position;

      return {
        date: row.keys?.[0] || '',
        Google: position, // We'll map 'Google' to Average Position on the charts
        Clicks: clicks,
        Impressions: impressions,
      };
    });

    // Ensure dates are sorted chronologically
    timeSeriesData.sort((a, b) => a.date.localeCompare(b.date));

    const avgPosition = rows.length > 0 ? (totalPosition / rows.length).toFixed(1) : '0';

    return {
      timeSeriesData,
      totals: {
        clicks: totalClicks,
        impressions: totalImpressions,
        avgPosition
      }
    };
  } catch (error: any) {
    console.error("Error fetching GSC data:", error);
    return { error: error.message };
  }
}

export async function fetchTopQueries(siteUrl: string, startDate: string, endDate: string) {
  const auth = getAuthClient();
  if (!auth) return { queries: [] };

  const searchconsole = google.searchconsole({ version: 'v1', auth });

  try {
    const res = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['query'],
        rowLimit: 5,
        orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }]
      },
    });

    const rows = res.data.rows || [];
    const queries = rows.map(row => ({
      query: row.keys?.[0] || '',
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: ((row.ctr || 0) * 100).toFixed(1) + '%',
      position: (row.position || 0).toFixed(1)
    }));

    return { queries };
  } catch (error) {
    console.error("Error fetching GSC queries:", error);
    return { queries: [] };
  }
}
