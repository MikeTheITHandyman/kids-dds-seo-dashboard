'use client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface VisibilityChartProps {
  data: any[];
  lines: { key: string; color: string; name: string }[];
  reversedY?: boolean;
  domainY?: [number | string, number | string];
  compare?: boolean;
}

export default function VisibilityChart({ data, lines, reversedY = true, domainY = [1, 'auto'], compare = false }: VisibilityChartProps) {
  const formatDateTick = (val: string) => {
    if (!val || typeof val !== 'string') return val;
    // Shorten YYYY-MM-DD to MM/DD on axes so narrow screens stay uncluttered
    const parts = val.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}`;
    }
    return val;
  };

  return (
    <div className="h-64 sm:h-80 md:h-96 w-full -ml-2 sm:ml-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            stroke="#64748b"
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickFormatter={formatDateTick}
            minTickGap={22}
          />
          <YAxis
            reversed={reversedY}
            stroke="#64748b"
            tick={{ fill: '#64748b', fontSize: 11 }}
            domain={domainY}
            width={38}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 12px -1px rgb(0 0 0 / 0.1)',
              fontSize: '12px',
              padding: '8px 10px'
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
            iconSize={10}
          />
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color}
              name={line.name}
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 1.5 }}
              activeDot={{ r: 6 }}
            />
          ))}
          {compare && lines.map((line) => (
            <Line
              key={`${line.key}_prev`}
              type="monotone"
              dataKey={`${line.key}_prev`}
              stroke={line.color}
              name={`${line.name} (Prev)`}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
