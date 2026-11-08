'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Search,
  Sparkles,
  BarChart3,
  ClipboardList,
  Settings,
  Menu,
  X,
  Smartphone,
  Building2,
} from 'lucide-react';
import { normalizeRange } from '@/lib/date-utils';
import type { ClientConfig } from '@/lib/clients';

const TIMEFRAME_COOKIE_NAME = 'kdds_timeframe';

const NAV_ITEMS = [
  {
    name: 'Overview',
    shortName: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
    exact: true,
    keepTimeframe: true,
  },
  {
    name: 'Search Engines',
    shortName: 'SEO',
    href: '/dashboard/search-visibility',
    icon: Search,
    keepTimeframe: true,
  },
  {
    name: 'LLM Visibility',
    shortName: 'AI / LLM',
    href: '/dashboard/llm-visibility',
    icon: Sparkles,
    keepTimeframe: true,
  },
  {
    name: 'Web Analytics',
    shortName: 'Traffic',
    href: '/dashboard/analytics',
    icon: BarChart3,
    keepTimeframe: true,
  },
  {
    name: 'Leads & Key Events',
    shortName: 'Leads',
    href: '/dashboard/leads',
    icon: ClipboardList,
    keepTimeframe: true,
  },
  {
    name: 'Settings & Clients',
    shortName: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    keepTimeframe: false,
  },
];

function buildSavedQueryString(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(TIMEFRAME_COOKIE_NAME);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.range) {
        const params = new URLSearchParams();
        const range = normalizeRange(parsed.range);
        params.set('range', range);
        if (parsed.granularity) params.set('granularity', parsed.granularity);
        if (range === 'custom' && parsed.start && parsed.end) {
          params.set('start', parsed.start);
          params.set('end', parsed.end);
        }
        if (parsed.compare === 'true' && range !== 'custom') {
          params.set('compare', 'true');
        }
        return params.toString();
      }
    }
  } catch {
    // ignore
  }
  return '';
}

export default function DashboardNavigation({
  children,
  banner,
  activeClient,
  clients = [],
  isSuperAdmin = false,
}: {
  children: React.ReactNode;
  banner?: React.ReactNode;
  activeClient?: ClientConfig;
  clients?: ClientConfig[];
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [timeframeQuery, setTimeframeQuery] = useState('');

  const clientName = activeClient?.name || 'Kids Dentist';
  const clientShort = activeClient?.shortName || 'KD';
  const clientSubtitle = activeClient?.subtitle || 'Kids Dentist • Grayslake, IL';

  useEffect(() => {
    setTimeframeQuery(buildSavedQueryString());

    const handleTimeframeChange = () => {
      setTimeframeQuery(buildSavedQueryString());
    };

    window.addEventListener('kdds-timeframe-change', handleTimeframeChange);
    return () => {
      window.removeEventListener('kdds-timeframe-change', handleTimeframeChange);
    };
  }, [pathname]);

  const handleClientSwitch = async (nextClientId: string) => {
    try {
      await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switch', clientId: nextClientId }),
      });
      window.location.reload();
    } catch (e) {
      console.error('Error switching client:', e);
    }
  };

  const getNavHref = (item: (typeof NAV_ITEMS)[number]) => {
    if (!item.keepTimeframe || !timeframeQuery) return item.href;
    return `${item.href}?${timeframeQuery}`;
  };

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const currentNav = NAV_ITEMS.find(item => isActive(item.href, item.exact)) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col shrink-0 sticky top-0 h-screen">
        <div className="p-5 border-b border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#6B4BC8] text-white font-bold flex items-center justify-center shadow-sm shrink-0">
              {clientShort}
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-[#6B4BC8] leading-tight truncate">
                {clientName}
              </h1>
              <p className="text-xs text-slate-500 font-medium truncate">SEO &amp; AI Analytics</p>
            </div>
          </div>

          {/* Client Switcher Dropdown */}
          {(clients.length > 1 || isSuperAdmin) && (
            <div className="pt-1">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                <Building2 className="h-3 w-3 text-[#6B4BC8]" />
                <span>Active Client</span>
                {isSuperAdmin && (
                  <span className="ml-auto text-[#6B4BC8] bg-purple-50 px-1.5 py-0.2 rounded">
                    Super Admin
                  </span>
                )}
              </div>
              <select
                value={activeClient?.id || 'kids-dentist'}
                onChange={e => handleClientSwitch(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800 focus:outline-none focus:border-[#6B4BC8] cursor-pointer"
              >
                {clients.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.primaryLocation || c.domain || c.id})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1.5">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={getNavHref(item)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#6B4BC8]/10 text-[#6B4BC8] font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#6B4BC8]' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Logged in via Google
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="lg:hidden sticky top-0 z-30 h-14 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center justify-between px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#6B4BC8] text-white text-sm font-bold flex items-center justify-center shadow-xs shrink-0">
            {clientShort}
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-slate-900 leading-none truncate">
              {clientName}
            </h1>
            <p className="text-[11px] text-[#6B4BC8] font-medium mt-0.5 truncate">
              {currentNav.name}
            </p>
          </div>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle Menu"
          className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 active:bg-slate-200 transition-colors"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Mobile Slide-Out Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative ml-auto w-72 max-w-[80vw] bg-white h-full shadow-2xl flex flex-col z-50">
            <div className="p-4 border-b border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#6B4BC8] text-white text-sm font-bold flex items-center justify-center">
                    {clientShort}
                  </div>
                  <span className="font-bold text-slate-800 truncate">{clientName}</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {(clients.length > 1 || isSuperAdmin) && (
                <select
                  value={activeClient?.id || 'kids-dentist'}
                  onChange={e => handleClientSwitch(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-semibold text-slate-800"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      Client: {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map(item => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={getNavHref(item)}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#6B4BC8] text-white shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
                <Smartphone className="h-4 w-4 text-[#6B4BC8]" />
                <span>Tip: Add to Home Screen</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                In Safari or Chrome, tap <strong>Share → Add to Home Screen</strong> to install this dashboard as a full-screen phone app.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Desktop Header */}
        <header className="hidden lg:flex h-16 bg-white border-b border-slate-200 items-center px-8 justify-between sticky top-0 z-20">
          <h2 className="text-lg font-semibold text-slate-800">{currentNav.name}</h2>
          <div className="text-xs text-slate-500 font-medium">{clientSubtitle}</div>
        </header>

        <div className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-full overflow-x-hidden">
          {banner}
          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-1 py-1 flex items-center justify-around shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={getNavHref(item)}
              className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl min-w-[60px] transition-colors ${
                active ? 'text-[#6B4BC8] font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className={`p-1 rounded-lg ${active ? 'bg-[#6B4BC8]/12' : ''}`}>
                <Icon className={`h-5 w-5 ${active ? 'text-[#6B4BC8]' : 'text-slate-400'}`} />
              </div>
              <span className="text-[10px] mt-0.5 leading-tight truncate">{item.shortName}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
