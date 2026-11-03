'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { normalizeRange } from '@/lib/date-utils';

const TIMEFRAME_COOKIE_NAME = 'kdds_timeframe';

interface TimeframePrefs {
  range: string;
  granularity: string;
  start?: string;
  end?: string;
  compare?: string;
}

function readSavedPrefs(): TimeframePrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${TIMEFRAME_COOKIE_NAME}=`));
    if (match) {
      const val = match.split('=')[1];
      const parsed = JSON.parse(decodeURIComponent(val));
      if (parsed && parsed.range) {
        return {
          ...parsed,
          range: normalizeRange(parsed.range),
        };
      }
    }
  } catch {
    // ignore cookie parse error
  }

  try {
    const raw = window.localStorage.getItem(TIMEFRAME_COOKIE_NAME);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.range) {
        return {
          ...parsed,
          range: normalizeRange(parsed.range),
        };
      }
    }
  } catch {
    // ignore localStorage error
  }

  return null;
}

function savePrefs(prefs: TimeframePrefs) {
  if (typeof window === 'undefined') return;
  const normalized: TimeframePrefs = {
    range: normalizeRange(prefs.range),
    granularity: prefs.granularity || 'day',
    ...(prefs.range === 'custom' && prefs.start ? { start: prefs.start } : {}),
    ...(prefs.range === 'custom' && prefs.end ? { end: prefs.end } : {}),
    ...(prefs.compare === 'true' ? { compare: 'true' } : {}),
  };
  const serialized = JSON.stringify(normalized);
  document.cookie = `${TIMEFRAME_COOKIE_NAME}=${encodeURIComponent(
    serialized
  )}; path=/; max-age=31536000; SameSite=Lax`;
  try {
    window.localStorage.setItem(TIMEFRAME_COOKIE_NAME, serialized);
  } catch {
    // ignore storage quota errors
  }
  window.dispatchEvent(new CustomEvent('kdds-timeframe-change', { detail: normalized }));
}

export default function DateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlRange = searchParams.get('range');
  const urlGranularity = searchParams.get('granularity');
  const urlStart = searchParams.get('start');
  const urlEnd = searchParams.get('end');
  const urlCompare = searchParams.get('compare');

  const [savedPrefs, setSavedPrefs] = useState<TimeframePrefs | null>(() => readSavedPrefs());

  const currentRange = normalizeRange(urlRange || savedPrefs?.range || '30D');
  const currentGranularity = urlGranularity || savedPrefs?.granularity || 'day';
  const currentCompare = (urlCompare ?? savedPrefs?.compare) === 'true';

  const [showCustom, setShowCustom] = useState(currentRange === 'custom');
  const [customStart, setCustomStart] = useState(urlStart || savedPrefs?.start || '');
  const [customEnd, setCustomEnd] = useState(urlEnd || savedPrefs?.end || '');

  useEffect(() => {
    const existing = readSavedPrefs();
    setSavedPrefs(existing);

    if (urlRange) {
      // URL explicitly specifies a range — persist it
      const nextPrefs: TimeframePrefs = {
        range: normalizeRange(urlRange),
        granularity: urlGranularity || existing?.granularity || 'day',
        start: urlStart || existing?.start,
        end: urlEnd || existing?.end,
        compare: urlCompare || existing?.compare,
      };
      savePrefs(nextPrefs);
      setShowCustom(nextPrefs.range === 'custom');
      if (nextPrefs.start) setCustomStart(nextPrefs.start);
      if (nextPrefs.end) setCustomEnd(nextPrefs.end);
    } else if (existing) {
      // Ensure cookie is written if it only came from localStorage
      savePrefs(existing);
      setShowCustom(existing.range === 'custom');
      if (existing.start) setCustomStart(existing.start);
      if (existing.end) setCustomEnd(existing.end);
    }
  }, [urlRange, urlGranularity, urlStart, urlEnd, urlCompare]);

  const buildParamsWithCurrent = (overrides: Partial<TimeframePrefs>) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextRange = normalizeRange(overrides.range ?? currentRange);
    const nextGranularity = overrides.granularity ?? currentGranularity;
    const nextStart = overrides.start !== undefined ? overrides.start : customStart;
    const nextEnd = overrides.end !== undefined ? overrides.end : customEnd;
    const nextCompare =
      overrides.compare !== undefined ? overrides.compare : currentCompare ? 'true' : '';

    params.set('range', nextRange);
    params.set('granularity', nextGranularity);

    if (nextRange === 'custom' && nextStart && nextEnd) {
      params.set('start', nextStart);
      params.set('end', nextEnd);
    } else {
      params.delete('start');
      params.delete('end');
    }

    if (nextCompare === 'true' && nextRange !== 'custom') {
      params.set('compare', 'true');
    } else {
      params.delete('compare');
    }

    savePrefs({
      range: nextRange,
      granularity: nextGranularity,
      start: nextRange === 'custom' ? nextStart : undefined,
      end: nextRange === 'custom' ? nextEnd : undefined,
      compare: nextCompare === 'true' && nextRange !== 'custom' ? 'true' : undefined,
    });

    return params;
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = normalizeRange(e.target.value);
    if (val === 'custom') {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      const params = buildParamsWithCurrent({ range: val, start: '', end: '' });
      router.push(`?${params.toString()}`);
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      const params = buildParamsWithCurrent({
        range: 'custom',
        start: customStart,
        end: customEnd,
        compare: '',
      });
      router.push(`?${params.toString()}`);
    }
  };

  const handleGranularityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const params = buildParamsWithCurrent({ granularity: val });
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
      <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-xs flex-1 sm:flex-initial justify-between">
        <select
          value={showCustom ? 'custom' : currentRange}
          onChange={handlePresetChange}
          className="text-xs sm:text-sm text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer py-1.5 px-2 border-r border-slate-200 flex-1 sm:flex-initial font-medium"
        >
          <option value="1D">Today (1D)</option>
          <option value="TW">This Week</option>
          <option value="7D">Last 7 Days</option>
          <option value="30D">Last 30 Days</option>
          <option value="TM">This Month</option>
          <option value="LM">Last Month</option>
          <option value="YTD">Year to Date</option>
          <option value="custom">Custom...</option>
        </select>

        <select
          value={currentGranularity}
          onChange={handleGranularityChange}
          className="text-xs sm:text-sm text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer py-1.5 px-2 font-medium"
        >
          <option value="day">By Day</option>
          <option value="week">By Week</option>
          <option value="month">By Month</option>
        </select>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1.5 shadow-xs text-xs sm:text-sm w-full sm:w-auto">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="border border-slate-200 rounded focus:ring-0 text-slate-600 bg-slate-50 py-1 px-2 flex-1 min-w-[120px]"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="border border-slate-200 rounded focus:ring-0 text-slate-600 bg-slate-50 py-1 px-2 flex-1 min-w-[120px]"
          />
          <button
            onClick={handleCustomApply}
            className="px-3 py-1.5 bg-[#6B4BC8] text-white rounded-md hover:bg-[#5b3eb3] transition-colors font-medium w-full sm:w-auto"
          >
            Apply
          </button>
        </div>
      )}

      <div className="flex items-center bg-white border border-slate-200 rounded-lg py-2 px-3 shadow-xs text-xs sm:text-sm">
        <label className={`flex items-center space-x-2 cursor-pointer ${showCustom ? 'opacity-50' : ''}`}>
          <input
            type="checkbox"
            disabled={showCustom}
            checked={!showCustom && currentCompare}
            onChange={(e) => {
              const params = buildParamsWithCurrent({
                compare: e.target.checked ? 'true' : '',
              });
              router.push(`?${params.toString()}`);
            }}
            className="rounded border-slate-300 text-[#6B4BC8] focus:ring-[#6B4BC8]"
          />
          <span className="text-slate-600 font-medium">Compare</span>
        </label>
      </div>
    </div>
  );
}
