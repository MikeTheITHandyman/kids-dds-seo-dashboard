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
  return (
    <div className="h-96 w-full bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="date" stroke="#64748b" tick={{ fill: '#64748b' }} />
          <YAxis reversed={reversedY} stroke="#64748b" tick={{ fill: '#64748b' }} domain={domainY} />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
          />
          <Legend />
          {lines.map((line) => (
            <Line 
              key={line.key}
              type="monotone" 
              dataKey={line.key} 
              stroke={line.color} 
              name={line.name}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6 }}
            />
          ))}
          {compare && lines.map((line) => (
            <Line 
              key={`${line.key}_prev`}
              type="monotone" 
              dataKey={`${line.key}_prev`} 
              stroke={line.color} 
              name={`${line.name} (Previous)`}
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
