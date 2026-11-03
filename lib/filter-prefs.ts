import { cookies } from 'next/headers';
import { Granularity } from './data-aggregation';
import { normalizeRange } from './date-utils';

export const TIMEFRAME_COOKIE_NAME = 'kdds_timeframe';

export interface SavedTimeframePrefs {
  range?: string;
  granularity?: Granularity;
  start?: string;
  end?: string;
  compare?: string;
}

export async function resolveFilterParams(rawParams: {
  range?: string;
  granularity?: string;
  start?: string;
  end?: string;
  compare?: string;
  [key: string]: string | undefined;
}) {
  let saved: SavedTimeframePrefs = {};
  try {
    const cookieStore = await cookies();
    const rawCookie = cookieStore.get(TIMEFRAME_COOKIE_NAME)?.value;
    if (rawCookie) {
      saved = JSON.parse(decodeURIComponent(rawCookie));
    }
  } catch {
    // Ignore malformed cookie
  }

  const range = normalizeRange(rawParams.range || saved.range || '30D');
  const granularity = ((rawParams.granularity || saved.granularity || 'day') as Granularity);
  const start = rawParams.start ?? (range === 'custom' ? saved.start : undefined);
  const end = rawParams.end ?? (range === 'custom' ? saved.end : undefined);
  const compareStr = rawParams.compare ?? saved.compare;
  const compare = compareStr === 'true' && range !== 'custom';

  return {
    range,
    granularity,
    start,
    end,
    compare,
  };
}
