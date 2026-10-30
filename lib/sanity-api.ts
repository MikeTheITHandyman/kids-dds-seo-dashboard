export type FormSubmissionType = 'appointment' | 'ask-doctor' | 'contact';
export type FormFilterType = 'all' | FormSubmissionType;

export interface SanityFormSubmission {
  _id: string;
  formType: FormSubmissionType;
  submittedAt: string;
}

export interface FormLeadsSeriesRow {
  date: string;
  Total: number;
  Appointment: number;
  AskDoctor: number;
  Contact: number;
  [key: string]: string | number;
}

export interface FormLeadsResult {
  timeSeriesData: FormLeadsSeriesRow[];
  totals: {
    total: number;
    appointment: number;
    askDoctor: number;
    contact: number;
  };
  error?: string;
}

const SANITY_PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'c7522jcx';
const SANITY_DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const SANITY_API_VERSION = 'v2024-01-01';

/**
 * Formats a Date object to YYYY-MM-DD in local time (America/Chicago on server or local TZ).
 */
function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fetches formSubmission records from Sanity within [startDate, endDate] (YYYY-MM-DD).
 * Never fetches PII fields — only _id, formType, and submittedAt.
 */
export async function fetchSanityFormSubmissions(
  startDate: string,
  endDate: string,
  isOneDay: boolean = false
): Promise<FormLeadsResult> {
  // Build inclusive UTC/local ISO bounds covering the full start and end dates
  const startBound = new Date(`${startDate}T00:00:00`);
  const endBound = new Date(`${endDate}T23:59:59.999`);

  const startIso = startBound.toISOString();
  const endIso = endBound.toISOString();

  const groq = `*[_type == "formSubmission" && coalesce(submittedAt, _createdAt) >= $startIso && coalesce(submittedAt, _createdAt) <= $endIso]{
    _id,
    formType,
    "submittedAt": coalesce(submittedAt, _createdAt)
  } | order(submittedAt asc)`;

  const url = new URL(
    `https://${SANITY_PROJECT_ID}.api.sanity.io/${SANITY_API_VERSION}/data/query/${SANITY_DATASET}`
  );
  url.searchParams.set('query', groq);
  url.searchParams.set('$startIso', JSON.stringify(startIso));
  url.searchParams.set('$endIso', JSON.stringify(endIso));

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  const token = process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url.toString(), {
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Sanity query error:', res.status, text);
      return {
        timeSeriesData: [],
        totals: { total: 0, appointment: 0, askDoctor: 0, contact: 0 },
        error: `Sanity API returned ${res.status}`,
      };
    }

    const json = await res.json();
    const docs: SanityFormSubmission[] = Array.isArray(json.result) ? json.result : [];

    let totalAppointment = 0;
    let totalAskDoctor = 0;
    let totalContact = 0;

    // Bucket map keyed by YYYY-MM-DD (or HH:00 for 1D view)
    const buckets: Record<
      string,
      { Total: number; Appointment: number; AskDoctor: number; Contact: number }
    > = {};

    if (isOneDay) {
      for (let h = 0; h < 24; h++) {
        const hourKey = `${String(h).padStart(2, '0')}:00`;
        buckets[hourKey] = { Total: 0, Appointment: 0, AskDoctor: 0, Contact: 0 };
      }
    } else {
      const cursor = new Date(`${startDate}T00:00:00`);
      const last = new Date(`${endDate}T00:00:00`);
      while (cursor <= last) {
        const key = formatLocalDate(cursor);
        buckets[key] = { Total: 0, Appointment: 0, AskDoctor: 0, Contact: 0 };
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    for (const doc of docs) {
      if (!doc.submittedAt) continue;
      const dt = new Date(doc.submittedAt);
      if (isNaN(dt.getTime())) continue;

      const bucketKey = isOneDay
        ? `${String(dt.getHours()).padStart(2, '0')}:00`
        : formatLocalDate(dt);

      if (!buckets[bucketKey]) {
        buckets[bucketKey] = { Total: 0, Appointment: 0, AskDoctor: 0, Contact: 0 };
      }

      if (doc.formType === 'appointment') {
        buckets[bucketKey].Appointment += 1;
        buckets[bucketKey].Total += 1;
        totalAppointment += 1;
      } else if (doc.formType === 'ask-doctor') {
        buckets[bucketKey].AskDoctor += 1;
        buckets[bucketKey].Total += 1;
        totalAskDoctor += 1;
      } else if (doc.formType === 'contact') {
        buckets[bucketKey].Contact += 1;
        buckets[bucketKey].Total += 1;
        totalContact += 1;
      }
    }

    const timeSeriesData: FormLeadsSeriesRow[] = Object.keys(buckets)
      .sort()
      .map((date) => ({
        date,
        Total: buckets[date].Total,
        Appointment: buckets[date].Appointment,
        AskDoctor: buckets[date].AskDoctor,
        Contact: buckets[date].Contact,
      }));

    return {
      timeSeriesData,
      totals: {
        total: totalAppointment + totalAskDoctor + totalContact,
        appointment: totalAppointment,
        askDoctor: totalAskDoctor,
        contact: totalContact,
      },
    };
  } catch (error: any) {
    console.error('Error fetching Sanity form submissions:', error);
    return {
      timeSeriesData: [],
      totals: { total: 0, appointment: 0, askDoctor: 0, contact: 0 },
      error: error?.message || 'Failed to query Sanity',
    };
  }
}
