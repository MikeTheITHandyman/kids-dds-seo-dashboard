export type Granularity = 'day' | 'week' | 'month';

// Helper to get week number
function getWeekNumber(d: Date) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function aggregateData(
  data: any[],
  granularity: Granularity,
  aggregationType: 'sum' | 'average'
) {
  if (granularity === 'day') return data;

  const grouped = data.reduce((acc, curr) => {
    const d = new Date(curr.date);
    let key = '';

    if (granularity === 'week') {
      key = `${d.getFullYear()}-W${getWeekNumber(d).toString().padStart(2, '0')}`;
    } else if (granularity === 'month') {
      key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    if (!acc[key]) {
      acc[key] = { items: [], labelDate: curr.date };
    }
    acc[key].items.push(curr);
    return acc;
  }, {} as Record<string, { items: any[]; labelDate: string }>);

  return Object.keys(grouped).sort().map((key) => {
    const group = grouped[key];
    const result: any = { date: key }; // use the week/month string as the X-axis label

    // Extract all numeric keys to aggregate
    const metricKeys = Object.keys(group.items[0]).filter(k => k !== 'date' && typeof group.items[0][k] === 'number');

    metricKeys.forEach(metric => {
      const sum = group.items.reduce((total: number, item: any) => total + (item[metric] || 0), 0);
      if (aggregationType === 'average') {
        result[metric] = Math.round(sum / group.items.length);
      } else {
        result[metric] = sum;
      }
    });

    return result;
  });
}
