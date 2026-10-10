'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function DateFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRange = searchParams.get('range') || '30D';
  const currentGranularity = searchParams.get('granularity') || 'day';
  
  const [showCustom, setShowCustom] = useState(currentRange === 'custom');
  const [customStart, setCustomStart] = useState(searchParams.get('start') || '');
  const [customEnd, setCustomEnd] = useState(searchParams.get('end') || '');

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', val);
    
    if (val === 'custom') {
      setShowCustom(true);
      // Don't push yet, wait for dates
    } else {
      setShowCustom(false);
      params.delete('start');
      params.delete('end');
      router.push(`?${params.toString()}`);
    }
  };

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('range', 'custom');
      params.set('start', customStart);
      params.set('end', customEnd);
      router.push(`?${params.toString()}`);
    }
  };

  const handleGranularityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set('granularity', val);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-md p-1 shadow-sm">
        <select 
          value={currentRange}
          onChange={handlePresetChange}
          className="text-sm text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer py-1 px-2 border-r border-slate-200"
        >
          <option value="1D">Today (1 Day)</option>
          <option value="TW">This Week</option>
          <option value="LW">Last Week</option>
          <option value="30D">Last 30 Days</option>
          <option value="TM">This Month</option>
          <option value="LM">Last Month</option>
          <option value="YTD">Year to Date</option>
          <option value="custom">Custom Range...</option>
        </select>
        
        <select 
          value={currentGranularity}
          onChange={handleGranularityChange}
          className="text-sm text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer py-1 px-2"
        >
          <option value="day">By Day</option>
          <option value="week">By Week</option>
          <option value="month">By Month</option>
        </select>
      </div>

      {showCustom && (
        <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-md p-1 shadow-sm text-sm">
          <input 
            type="date" 
            value={customStart} 
            onChange={(e) => setCustomStart(e.target.value)} 
            className="border-none focus:ring-0 text-slate-600 bg-transparent py-1 px-2"
          />
          <span className="text-slate-400">to</span>
          <input 
            type="date" 
            value={customEnd} 
            onChange={(e) => setCustomEnd(e.target.value)} 
            className="border-none focus:ring-0 text-slate-600 bg-transparent py-1 px-2"
          />
          <button 
            onClick={handleCustomApply}
            className="px-3 py-1 bg-[#6B4BC8] text-white rounded hover:bg-[#5b3eb3] transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-md py-1 px-3 shadow-sm text-sm">
        <label className={`flex items-center space-x-2 cursor-pointer ${showCustom ? 'opacity-50' : ''}`}>
          <input 
            type="checkbox" 
            disabled={showCustom}
            checked={!showCustom && searchParams.get('compare') === 'true'}
            onChange={(e) => {
              const params = new URLSearchParams(searchParams.toString());
              if (e.target.checked) {
                params.set('compare', 'true');
              } else {
                params.delete('compare');
              }
              router.push(`?${params.toString()}`);
            }}
            className="rounded border-slate-300 text-[#6B4BC8] focus:ring-[#6B4BC8]"
          />
          <span className="text-slate-600">Compare</span>
        </label>
      </div>
    </div>
  );
}
