import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  change: number; // percentage
}

export default function StatCard({ title, value, change }: StatCardProps) {
  const isPositive = change >= 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6 shadow-xs flex flex-col justify-between">
      <h3 className="text-xs sm:text-sm font-medium text-slate-500 mb-1.5">{title}</h3>
      <div className="flex items-baseline justify-between sm:justify-start gap-3">
        <span className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">{value}</span>
        <span
          className={`text-xs sm:text-sm font-semibold px-2 py-0.5 rounded-full ${
            isPositive
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-600'
          }`}
        >
          {isPositive ? '+' : ''}{change}%
        </span>
      </div>
    </div>
  );
}
