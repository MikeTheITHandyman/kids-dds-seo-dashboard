export function formatDateYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeRange(range?: string | null): string {
  if (!range) return '30D';
  if (range === 'LW') return '7D';
  return range;
}

export function getDateRangeBounds(
  rawRange: string,
  currentDate: Date = new Date(),
  customStart?: string,
  customEnd?: string
) {
  const range = normalizeRange(rawRange);
  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

  // Default: Last 30 Days ending yesterday (not including today)
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const thirtyDaysStart = new Date(today);
  thirtyDaysStart.setDate(today.getDate() - 30);

  let startDate = formatDateYMD(thirtyDaysStart);
  let endDate = formatDateYMD(yesterday);

  if (range === '7D') {
    const sevenDaysStart = new Date(today);
    sevenDaysStart.setDate(today.getDate() - 7);
    startDate = formatDateYMD(sevenDaysStart);
    endDate = formatDateYMD(yesterday);
  } else if (range === '30D') {
    startDate = formatDateYMD(thirtyDaysStart);
    endDate = formatDateYMD(yesterday);
  } else if (range === '1D') {
    startDate = formatDateYMD(today);
    endDate = formatDateYMD(today);
  } else if (range === 'TW') {
    const d = new Date(today);
    const day = d.getDay(); // 0 is Sunday
    d.setDate(d.getDate() - day);
    startDate = formatDateYMD(d);
    endDate = formatDateYMD(today);
  } else if (range === 'TM') {
    const month = String(today.getMonth() + 1).padStart(2, '0');
    startDate = `${today.getFullYear()}-${month}-01`;
    endDate = formatDateYMD(today);
  } else if (range === 'LM') {
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    const m = String(startOfLastMonth.getMonth() + 1).padStart(2, '0');
    const y = startOfLastMonth.getFullYear();
    startDate = `${y}-${m}-01`;
    endDate = `${y}-${m}-${String(endOfLastMonth.getDate()).padStart(2, '0')}`;
  } else if (range === 'YTD') {
    startDate = `${today.getFullYear()}-01-01`;
    endDate = formatDateYMD(today);
  } else if (range === 'custom') {
    if (customStart) startDate = customStart;
    if (customEnd) endDate = customEnd;
  }

  return {
    range,
    startDate,
    endDate,
    ga4StartDate: range === '1D' ? 'today' : startDate,
    ga4EndDate: range === '1D' ? 'today' : endDate,
  };
}

export function getPreviousPeriod(
  rawRange: string,
  currentDate: Date = new Date(),
  customStart?: string,
  customEnd?: string
) {
  const range = normalizeRange(rawRange);
  let prevStart = '';
  let prevEnd = '';
  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

  if (range === '1D') {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    prevStart = formatDateYMD(d);
    prevEnd = prevStart;
  } else if (range === '7D') {
    // Previous 7 days before [today - 7, today - 1] -> [today - 14, today - 8]
    const start = new Date(today);
    start.setDate(today.getDate() - 14);
    prevStart = formatDateYMD(start);

    const end = new Date(today);
    end.setDate(today.getDate() - 8);
    prevEnd = formatDateYMD(end);
  } else if (range === '30D' || !range) {
    // Previous 30 days before [today - 30, today - 1] -> [today - 60, today - 31]
    const start = new Date(today);
    start.setDate(today.getDate() - 60);
    prevStart = formatDateYMD(start);

    const end = new Date(today);
    end.setDate(today.getDate() - 31);
    prevEnd = formatDateYMD(end);
  } else if (range === 'TW') {
    const d = new Date(today);
    const day = d.getDay();
    d.setDate(d.getDate() - day - 7); // Last Sunday
    prevStart = formatDateYMD(d);

    const end = new Date(d);
    end.setDate(end.getDate() + 6); // Last Saturday
    prevEnd = formatDateYMD(end);
  } else if (range === 'TM') {
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const m = String(prevMonth.getMonth() + 1).padStart(2, '0');
    const y = prevMonth.getFullYear();
    prevStart = `${y}-${m}-01`;

    const endOfPrev = new Date(today.getFullYear(), today.getMonth(), 0);
    prevEnd = `${y}-${m}-${String(endOfPrev.getDate()).padStart(2, '0')}`;
  } else if (range === 'LM') {
    const prev2Month = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const m = String(prev2Month.getMonth() + 1).padStart(2, '0');
    const y = prev2Month.getFullYear();
    prevStart = `${y}-${m}-01`;

    const endOfPrev2 = new Date(today.getFullYear(), today.getMonth() - 1, 0);
    prevEnd = `${y}-${m}-${String(endOfPrev2.getDate()).padStart(2, '0')}`;
  } else if (range === 'YTD') {
    prevStart = `${today.getFullYear() - 1}-01-01`;
    const lastYearToday = new Date(today);
    lastYearToday.setFullYear(lastYearToday.getFullYear() - 1);
    prevEnd = formatDateYMD(lastYearToday);
  } else if (range === 'custom' && customStart && customEnd) {
    const s = new Date(`${customStart}T00:00:00`);
    const e = new Date(`${customEnd}T00:00:00`);
    const diffDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const pEnd = new Date(s);
    pEnd.setDate(pEnd.getDate() - 1);
    const pStart = new Date(pEnd);
    pStart.setDate(pStart.getDate() - (diffDays - 1));
    prevStart = formatDateYMD(pStart);
    prevEnd = formatDateYMD(pEnd);
  }

  return { prevStart, prevEnd };
}

export function buildDateRangeArray(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const last = new Date(`${endDate}T00:00:00`);
  if (isNaN(cursor.getTime()) || isNaN(last.getTime()) || cursor > last) {
    return [startDate];
  }
  while (cursor <= last) {
    dates.push(formatDateYMD(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function mergeComparisonData(currentData: any[], prevData: any[], keysToCompare: string[]) {
  return currentData.map((row, i) => {
    const merged = { ...row };
    const prevRow = prevData[i] || {};
    keysToCompare.forEach((k) => {
      merged[`${k}_prev`] = prevRow[k] || 0;
    });
    return merged;
  });
}
