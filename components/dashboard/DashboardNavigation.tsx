'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Search,
  Sparkles,
  BarChart3,
  Settings,
  Menu,
  X,
  Smartphone
} from 'lucide-react';

const NAV_ITEMS = [
  {
    name: 'Overview',
    shortName: 'Overview',
    href: '/dashboard',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    name: 'Search Engines',
    shortName: 'SEO',
    href: '/dashboard/search-visibility',
    icon: Search,
  },
  {
    name: 'LLM Visibility',
    shortName: 'AI / LLM',
    href: '/dashboard/llm-visibility',
    icon: Sparkles,
  },
  {
    name: 'Web Analytics',
    shortName: 'Traffic',
    href: '/dashboard/analytics',
    icon: BarChart3,
  },
  {
    name: 'Settings & Users',
    shortName: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
  },
];

export default function DashboardNavigation({ children, banner }: { children: React.ReactNode; banner?: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const currentNav = NAV_ITEMS.find((item) => isActive(item.href, item.exact)) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col shrink-0 sticky top-0 h-screen">
        <div className="p-6 border-b border-slate-200 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#6B4BC8] text-white font-bold flex items-center justify-center shadow-sm">
            KD
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#6B4BC8] leading-tight">Kids DDS</h1>
            <p className="text-xs text-slate-500 font-medium">SEO & AI Analytics</p>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
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
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#6B4BC8] text-white text-sm font-bold flex items-center justify-center shadow-xs">
            KD
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 leading-none">Kids DDS Analytics</h1>
            <p className="text-[11px] text-[#6B4BC8] font-medium mt-0.5">{currentNav.name}</p>
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
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#6B4BC8] text-white text-sm font-bold flex items-center justify-center">
                  KD
                </div>
                <span className="font-bold text-slate-800">Navigation</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
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
          <div className="text-xs text-slate-400">Kids Dentist • Grayslake, IL</div>
        </header>

        <div className="flex-1 p-3.5 sm:p-6 lg:p-8 pb-24 lg:pb-8 max-w-full overflow-x-hidden">
          {banner}
          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 px-1 py-1 flex items-center justify-around shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl min-w-[60px] transition-colors ${
                active
                  ? 'text-[#6B4BC8] font-semibold'
                  : 'text-slate-500 hover:text-slate-800'
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
