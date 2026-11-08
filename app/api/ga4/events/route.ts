import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchGA4AvailableEvents } from '@/lib/ga4-api';
import { getActiveClientConfig } from '@/lib/clients';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    let propertyId = searchParams.get('propertyId') || '';

    if (!propertyId) {
      const client = await getActiveClientConfig(searchParams.get('clientId'));
      propertyId = client.ga4PropertyId;
    }

    if (!propertyId) {
      return NextResponse.json({
        events: [],
        error: 'No GA4 Property ID configured for this client',
      });
    }

    const result = await fetchGA4AvailableEvents(propertyId, '90daysAgo', 'today');
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { events: [], error: e.message || 'Failed to discover GA4 events' },
      { status: 500 }
    );
  }
}
