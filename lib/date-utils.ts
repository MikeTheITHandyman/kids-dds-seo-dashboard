export function getPreviousPeriod(range: string, currentDate: Date = new Date()) {
  let prevStart = '';
  let prevEnd = '';
  const d = new Date(currentDate);

  if (range === '1D') {
    d.setDate(d.getDate() - 1);
    prevStart = d.toISOString().split('T')[0];
    prevEnd = prevStart;
  } else if (range === 'TW') {
    const day = d.getDay();
    d.setDate(d.getDate() - day - 7); // Last Sunday
    prevStart = d.toISOString().split('T')[0];
    
    const end = new Date(d);
    end.setDate(end.getDate() + 6); // Last Saturday
    prevEnd = end.toISOString().split('T')[0];
  } else if (range === 'LW') {
    const day = d.getDay();
    d.setDate(d.getDate() - day - 14); // 2 Sundays ago
    prevStart = d.toISOString().split('T')[0];
    
    const end = new Date(d);
    end.setDate(end.getDate() + 6); // 2 Saturdays ago
    prevEnd = end.toISOString().split('T')[0];
  } else if (range === '30D' || !range) {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - 60);
    prevStart = start.toISOString().split('T')[0];
    
    const end = new Date(currentDate);
    end.setDate(end.getDate() - 31);
    prevEnd = end.toISOString().split('T')[0];
  } else if (range === 'TM') {
    const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const m = (prevMonth.getMonth() + 1).toString().padStart(2, '0');
    const y = prevMonth.getFullYear();
    prevStart = `${y}-${m}-01`;
    
    const endOfPrev = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
    prevEnd = `${y}-${m}-${endOfPrev.getDate().toString().padStart(2, '0')}`;
  } else if (range === 'LM') {
    const prev2Month = new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1);
    const m = (prev2Month.getMonth() + 1).toString().padStart(2, '0');
    const y = prev2Month.getFullYear();
    prevStart = `${y}-${m}-01`;
    
    const endOfPrev2 = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 0);
    prevEnd = `${y}-${m}-${endOfPrev2.getDate().toString().padStart(2, '0')}`;
  } else if (range === 'YTD') {
    prevStart = `${currentDate.getFullYear() - 1}-01-01`;
    const lastYearToday = new Date(currentDate);
    lastYearToday.setFullYear(lastYearToday.getFullYear() - 1);
    prevEnd = lastYearToday.toISOString().split('T')[0];
  }

  return { prevStart, prevEnd };
}

export function mergeComparisonData(currentData: any[], prevData: any[], keysToCompare: string[]) {
  return currentData.map((row, i) => {
    const merged = { ...row };
    const prevRow = prevData[i] || {};
    keysToCompare.forEach(k => {
      merged[`${k}_prev`] = prevRow[k] || 0;
    });
    return merged;
  });
}
