'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormFilterType } from '@/lib/sanity-api';

const FORM_TYPE_OPTIONS: { value: FormFilterType; label: string; dotColor?: string }[] = [
  { value: 'all', label: 'All Forms', dotColor: '#6B4BC8' },
  { value: 'appointment', label: 'Appointment Request', dotColor: '#EF6C1A' },
  { value: 'ask-doctor', label: 'Ask the Dentist', dotColor: '#10b981' },
  { value: 'contact', label: 'Contact Us', dotColor: '#3b82f6' },
];

export default function FormTypeFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentType = (searchParams.get('formType') || 'all') as FormFilterType;

  const handleSelect = (val: FormFilterType) => {
    const params = new URLSearchParams(searchParams.toString());
    if (val === 'all') {
      params.delete('formType');
    } else {
      params.set('formType', val);
    }
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 bg-white border border-slate-200 rounded-xl p-1.5 shadow-xs">
      <span className="text-xs font-medium text-slate-400 px-2 hidden sm:inline">Form Type:</span>
      {FORM_TYPE_OPTIONS.map((opt) => {
        const active = currentType === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleSelect(opt.value)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer ${
              active
                ? 'bg-[#6B4BC8] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: active ? '#ffffff' : opt.dotColor,
              }}
            />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
