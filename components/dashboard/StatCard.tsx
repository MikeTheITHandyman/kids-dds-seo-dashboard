import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  change: number; // percentage
}

export default function StatCard({ title, value, change }: StatCardProps) {
  const isPositive = change >= 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
      <h3 className="text-sm font-medium text-slate-500 mb-1">{title}</h3>
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-bold text-slate-800">{value}</span>
        <span className={`text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
          {isPositive ? '+' : ''}{change}%
        </span>
      </div>
    </div>
  );
}
